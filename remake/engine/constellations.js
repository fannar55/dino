import * as THREE from 'three';
import { farPlaneDepth } from './sun-face.js';
import { skyDirection, SKY_DISTANCE } from './night-sky.js';
import { bodyMesh } from './clip-probe.js';
import { FIGURES } from './constellation-figures.js';

// The constellations (the festival, chapters/hatid.js scene 2): each friend as a line drawing on the night sky, her outline and a
// few inner lines in her colour with stars at key places (the owner's word of 2026-11-26: better drawings of the friends, stars at
// the key places, lines a real constellation would not have). The drawings are traced from each model's own silhouette by
// remake/tools/hatid-merki.mjs into engine/constellation-figures.js, never drawn by eye (the chunk's ruling 3 as the spec's §7 now
// has it). Every point of a drawing is bound to one or two of her bones, so each frame the drawing is posed from her skeleton, seen
// from the view it was traced from, in her own root's frame: a lifted head lifts the drawing's head, a stomp moves its leg. Where she
// stands on the top and which way she faces there do not move it.
//
// It hangs from the camera as the night sky does (engine/night-sky.js: update(camera)) and is drawn at the far plane's depth
// (farPlaneDepth), so whatever stands in front of the sky hides it. Two draw calls for all of them: the stars (points) and the lines
// (quads facing the camera, `lineWidth` CSS pixels wide on any screen). None is fogged or tone mapped.
//
//   STAR_BONE     'Head': her own star (the brightest, the biggest, the tap star) is her eye, rigid to this bone
//   FIGURES       the traced drawings (engine/constellation-figures.js)
//   viewBasis({ turn, tilt, roll })  the view's screen right, up and toward the lens in her root's frame
//   createConstellations(world, { capacity, lineWidth })  { group, add, set, starOf, pointsOf, linesOf, drawingOf, outlineOf, skyOf,
//                 lookPivotOf, update, dispose }
//
// Places on the sky are { azimuth, elevation } in degrees (chapters/hatid-route.js SKY): azimuth from +X toward +Z (on the screen,
// a larger azimuth is to the right, wherever the camera looks), elevation up from the horizon.

const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const { clamp, smoothstep } = THREE.MathUtils;

export const STAR_BONE = 'Head';
export { FIGURES };
const STAR_SLOT = 16; // stars a constellation may have (her own and 7 to 13 more)
const LINE_SLOT = 320; // lines a constellation may have (the outline's 80 to 200 and the inner lines')
const SIZE = [1.05, 0.72, 0.5]; // degrees across at span 16 (her own, the middle, the small), growing with the square root of the span
const LIGHT = { star: [1, 0.9, 0.75], line: 0.8 };
const LINE_WIDTH = 1.8; // CSS pixels (the controller's first value)
const LINE_GLOW = { saturation: 0.85, lightness: 0.62 }; // the lines are her hue, brighter and fuller (her own colours are deep for the night)
const STAR_TINT = 0.55; // the stars are her line colour more than half way to white
const BREATH = 0.35; // how much larger the stars are at breath 1
/** How `drawn` 0 to 1 goes: the outline both ways round from her star until OUTLINE, then the inner lines until INNER, then the last
 * stars (the middle-sized ones: her tips) come out one after another. */
const PHASE = { outline: 0.7, inner: 0.9 };

/** The view's screen right, screen up and toward the lens in her root's frame (x ahead, y up, z her right), seen from her right side
 * turned `turn` degrees toward her front, lifted `tilt` over it, the picture turned `roll` degrees on the screen. */
export function viewBasis({ turn = 0, tilt = 0, roll = 0 } = {}) {
  const cy = Math.cos(rad(turn)), sy = Math.sin(rad(turn)), ct = Math.cos(rad(tilt)), st = Math.sin(rad(tilt));
  const r0 = new THREE.Vector3(cy, 0, -sy);
  const u0 = new THREE.Vector3(-sy * st, ct, -cy * st);
  const toward = new THREE.Vector3(sy * ct, st, cy * ct);
  const cr = Math.cos(rad(roll)), sr = Math.sin(rad(roll));
  return {
    right: r0.clone().multiplyScalar(cr).addScaledVector(u0, -sr),
    up: r0.clone().multiplyScalar(sr).addScaledVector(u0, cr),
    toward,
  };
}

// Points: as the night sky's (engine/night-sky.js), a soft round dot `aSize` across (the tangent of its angular diameter) in `aColor`.
const pointsVertex = /* glsl */`
attribute vec4 aColor;
attribute float aSize;
uniform float uHeight;
varying vec4 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float px = aSize * projectionMatrix[1][1] * uHeight * 0.5;
  gl_PointSize = max(px, 1.6) * 1.8;
  vColor = vec4(aColor.rgb, aColor.a * min(1.0, px / 1.6));
  if (!(aColor.a > 0.0)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const pointsFragment = /* glsl */`
varying vec4 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * (exp(-r * r * 7.0) * 0.8 + 0.2 * (1.0 - smoothstep(0.3, 0.5, r)));
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;
// Lines: each a quad facing the camera, `uWidth` device pixels wide (the line width in CSS pixels times the renderer's pixel ratio)
// and FEATHER more each side for a soft edge. `position` is this corner's end, `aOther` the line's other end, `aCorner` (end: 0 the
// near end, 1 the far; side: -1 or 1). screenCorner below is this shader's twin.
const linesVertex = /* glsl */`
attribute vec3 aOther;
attribute vec2 aCorner;
attribute vec4 aColor;
uniform vec2 uViewport;
uniform float uWidth;
uniform float uFeather;
varying vec4 vColor;
varying float vAcross;
void main() {
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 q = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
  vec2 halfView = 0.5 * uViewport;
  vec2 way = q.xy / q.w * halfView - p.xy / p.w * halfView;
  float len = length(way);
  way = len > 1e-6 ? way / len : vec2(1.0, 0.0);
  if (aCorner.x > 0.5) way = -way; // from the far end the other end lies back toward the near one: the same line either way
  vec2 across = vec2(-way.y, way.x);
  float outward = (0.5 * uWidth + uFeather) * aCorner.y;
  p.xy += across * outward / halfView * p.w;
  gl_Position = p;
  vColor = aColor;
  vAcross = outward;
  if (!(aColor.a > 0.0) || p.w <= 0.0 || q.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const linesFragment = /* glsl */`
uniform float uWidth;
uniform float uFeather;
varying vec4 vColor;
varying float vAcross;
void main() {
  float a = vColor.a * (1.0 - smoothstep(0.5 * uWidth - 0.5, 0.5 * uWidth + uFeather, abs(vAcross)));
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;
const FEATHER = 1; // device pixels of soft edge each side of a line

/**
 * The lines' vertex shader in JavaScript (for the tests): where a corner of a line's quad lands on the screen, in device pixels from
 * the middle, for a line from `a` to `b` (world points) seen by `camera` on a drawing buffer `viewport` [w, h] pixels, `width`
 * device pixels wide; `end` 0 at a, 1 at b; `side` -1 or 1.
 */
export function screenCorner(a, b, end, side, camera, viewport, width) {
  const toScreen = p => { const v = p.clone().project(camera); return [v.x * viewport[0] / 2, v.y * viewport[1] / 2]; };
  const [p, q] = end ? [toScreen(b), toScreen(a)] : [toScreen(a), toScreen(b)];
  let wx = q[0] - p[0];
  let wy = q[1] - p[1];
  const len = Math.hypot(wx, wy);
  [wx, wy] = len > 1e-6 ? [wx / len, wy / len] : [1, 0];
  if (end) { wx = -wx; wy = -wy; }
  const out = (0.5 * width + FEATHER) * side;
  return [p[0] - wy * out, p[1] + wx * out];
}
export const LINE_FEATHER = FEATHER;
function material(key, vertexShader, fragmentShader, uniforms = {}) {
  return farPlaneDepth(new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }), key);
}

/** How much a bone turns with her head when she looks: the head 1, the neck's bones less toward its base, the rest 0; and the
 * neck's base bone (the pivot). */
/** Her colour as her lines glow: the same hue, at least LINE_GLOW's fullness, LINE_GLOW's lightness. */
function glowOf(colour) {
  const hsl = new THREE.Color(colour).getHSL({});
  return new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, LINE_GLOW.saturation), LINE_GLOW.lightness);
}

function headChain(bones) {
  const by = new Map(bones.map(b => [b.name, b]));
  const head = by.get(STAR_BONE);
  const chain = [];
  for (let b = head?.parent; b?.isBone && /neck/i.test(b.name); b = b.parent) chain.push(b);
  const share = new Map([[STAR_BONE, 1], ['Jaw', 1]]);
  chain.forEach((b, i) => share.set(b.name, (chain.length - i) / (chain.length + 1)));
  return { share, pivot: chain.at(-1) ?? head };
}

/**
 * Up to `capacity` constellations in `world.scene`.
 *   group        the THREE.Group 'Constellations', in world.scene
 *   add(key, actor, { colour, azimuth, elevation, span = 16, facing = 1, figure = FIGURES[key] })  hers (the same key again replaces
 *                hers): her drawing's longest side covers `span` degrees of sky as she was traced, her own star at (azimuth,
 *                elevation) in the pose she was traced in; facing 1 as traced (her front to the right, but Flugeðla's view), -1 her
 *                mirror image. Nothing shows until set().
 *   set(key, { drawn = 1, level = 1, breath = 0, look = null })  drawn 0 to 1: the outline grows both ways round from the point
 *                nearest her star, then the inner lines, a star coming out as its line reaches it, her tips' stars last (her own
 *                whenever level is over 0); level her light; breath 0 to 1 a swell of her stars' size; look { azimuth, elevation }
 *                turns her head (and her neck, less toward its base) about her neck's base so her star lies toward a place in the sky
 *   starOf(key)  her own star now: { azimuth, elevation }
 *   pointsOf(key, out = [])  her stars now, each { name, point (its index in the drawing, -1 her own), azimuth, elevation,
 *                direction, light, size (degrees across) }
 *   linesOf(key) her lines as they sit in the buffer, each { kind ('outline' | 'inner'), near, far (indices in the drawing: near is
 *                the end it grows from), shown (0 to 1) }
 *   drawingOf(key), outlineOf(key)  every point of her drawing now (the outline's first, then the inner lines'), or the outline's:
 *                each { azimuth, elevation }
 *   skyOf(key, point)  where a point in her root's frame (metres) lands on the sky as her drawing is shown: { azimuth, elevation }
 *   lookPivotOf(key)  her neck's base on the sky now (what look turns about)
 *   update(camera)  her pose this frame into the picture, hung from the camera: after the actors' update, before the render
 *   dispose()
 * `lineWidth`: the lines' width in CSS pixels (times the renderer's pixel ratio as it draws), plus a soft edge of LINE_FEATHER
 * device pixels each side.
 */
export function createConstellations(world, { capacity = 6, lineWidth = LINE_WIDTH } = {}) {
  const group = new THREE.Group();
  group.name = 'Constellations';
  world.scene.add(group);
  const height = { value: 800 };
  const size = new THREE.Vector2();
  const measure = renderer => { height.value = renderer.getDrawingBufferSize(size).y || 800; };

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * STAR_SLOT * 3), 3));
  starGeometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(capacity * STAR_SLOT * 4), 4));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(capacity * STAR_SLOT), 1));
  const stars = new THREE.Points(starGeometry, material('constellation-stars-far', pointsVertex, pointsFragment, { uHeight: height }));
  stars.name = 'ConstellationStars';
  stars.renderOrder = -2.8; // over the night sky's stars (-3.5) and shooting stars (-3), under the sun's face (-2)
  stars.onBeforeRender = measure;
  // the lines: one mesh of quads, four corners and two triangles a line, its index made once
  const lineUniforms = { uViewport: { value: new THREE.Vector2(1280, 800) }, uWidth: { value: lineWidth }, uFeather: { value: FEATHER } };
  const quads = capacity * LINE_SLOT;
  const lineGeometry = new THREE.BufferGeometry();
  const attr = k => new THREE.BufferAttribute(new Float32Array(quads * 4 * k), k);
  lineGeometry.setAttribute('position', attr(3));
  lineGeometry.setAttribute('aOther', attr(3));
  lineGeometry.setAttribute('aColor', attr(4));
  const corner = attr(2);
  const index = new Uint32Array(quads * 6);
  for (let i = 0; i < quads; i++) {
    const o = 4 * i;
    corner.setXY(o, 0, -1); corner.setXY(o + 1, 0, 1); corner.setXY(o + 2, 1, -1); corner.setXY(o + 3, 1, 1);
    index.set([o, o + 2, o + 1, o + 1, o + 2, o + 3], 6 * i);
  }
  lineGeometry.setAttribute('aCorner', corner);
  lineGeometry.setIndex(new THREE.BufferAttribute(index, 1));
  const lines = new THREE.Mesh(lineGeometry, material('constellation-lines-far', linesVertex, linesFragment, lineUniforms));
  lines.material.side = THREE.DoubleSide;
  lines.material.blending = THREE.NormalBlending; // laid over the sky, not added to it: added to the night's blue her warm hues go grey
  lines.onBeforeRender = renderer => {
    renderer.getDrawingBufferSize(lineUniforms.uViewport.value);
    lineUniforms.uWidth.value = lineWidth * renderer.getPixelRatio();
  };
  lines.name = 'ConstellationLines';
  lines.renderOrder = -2.9;
  for (const o of [stars, lines]) { o.frustumCulled = false; o.visible = false; group.add(o); }

  const all = new Map(); // key -> her constellation
  const slots = Array(capacity).fill(null);
  const inverse = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();

  function add(key, actor, { colour = '#ffffff', azimuth = 0, elevation = 30, span = 16, facing = 1, figure = FIGURES[key] } = {}) {
    if (!figure) throw new Error(`createConstellations: no drawing of ${key}`);
    let slot = all.get(key)?.slot;
    if (slot === undefined) {
      slot = slots.indexOf(null);
      if (slot < 0) throw new Error(`createConstellations: room for ${capacity}, no more (${key})`);
    }
    const skin = bodyMesh(actor).skeleton.bones;
    const byName = new Map(skin.map(b => [b.name, b]));
    const bones = figure.bones.map(name => {
      const bone = byName.get(name);
      if (!bone) throw new Error(`createConstellations: ${key} has no bone ${name}`);
      return bone;
    });
    const count = figure.points.length / 9;
    const segments = [];
    for (let i = 0; i < figure.outline; i++) segments.push({ kind: 'outline', a: i, b: (i + 1) % figure.outline });
    for (const [first, n] of figure.inner) for (let i = first; i < first + n - 1; i++) segments.push({ kind: 'inner', a: i, b: i + 1 });
    if (segments.length > LINE_SLOT) throw new Error(`createConstellations: ${key} has ${segments.length} lines, room for ${LINE_SLOT}`);
    if (figure.stars.length + 1 > STAR_SLOT) throw new Error(`createConstellations: ${key} has too many stars`);
    const { share, pivot } = headChain(skin);
    const turnShare = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = figure.points;
      const a = figure.bones[p[9 * i]], b = p[9 * i + 1] >= 0 ? figure.bones[p[9 * i + 1]] : null;
      turnShare[i] = p[9 * i + 2] * (share.get(a) ?? 0) + (b ? (1 - p[9 * i + 2]) * (share.get(b) ?? 0) : 0);
    }
    const c = {
      key, actor, slot, figure, bones, count, segments, pivot,
      headBone: byName.get(STAR_BONE), eye: new THREE.Vector3(...figure.eye),
      basis: viewBasis(figure.view), face: facing < 0 ? -1 : 1,
      scale: span / figure.length, // degrees a metre
      home: skyDirection(azimuth, elevation),
      east: new THREE.Vector3(-Math.sin(rad(azimuth)), 0, Math.cos(rad(azimuth))),
      turnShare,
      sizeScale: Math.sqrt(span / 16),
      colour: glowOf(colour),
      starColour: glowOf(colour).lerp(new THREE.Color('#ffffff'), STAR_TINT),
      state: { drawn: 1, level: 0, breath: 0, look: null },
      flat: new Float64Array(2 * (count + 2)), // the points, her own star, the pivot: degrees right and up of home
      dirs: Array.from({ length: count + 2 }, () => new THREE.Vector3()),
      shown: new Float32Array(segments.length),
      light: new Float32Array(figure.stars.length + 1),
    };
    c.north = new THREE.Vector3().crossVectors(c.east, c.home).normalize();
    plan(c);
    if (all.has(key)) clearSlot(all.get(key).slot);
    all.set(key, c);
    slots[slot] = key;
    refresh(c);
    return c;
  }

  /** The order it is drawn in: each segment's rank on its way (and its near end), each star's moment. */
  function plan(c) {
    const { figure, segments } = c;
    const n = figure.outline;
    const half = Math.ceil(n / 2);
    const start = figure.start;
    for (const s of segments) {
      if (s.kind !== 'outline') continue;
      const forward = (s.a - start + n) % n;
      if (forward < half) { s.rank = forward; s.near = s.a; s.far = s.b; } else { s.rank = n - 1 - forward; s.near = s.b; s.far = s.a; }
      s.of = half;
    }
    // the inner lines: all at once, each from its first point (the tracer puts the end nearer her star first)
    for (const [first, len] of figure.inner) {
      const own = segments.filter(s => s.kind === 'inner' && s.a >= first && s.a < first + len - 1);
      own.forEach((s, k) => { s.rank = k; s.near = s.a; s.far = s.b; s.of = own.length; });
    }
    // stars: when the outline reaches each; the middle ones (her tips) last, one after another
    const middle = figure.stars.map((s, i) => ({ s, i })).filter(({ s }) => s[1] === 1);
    c.starAt = figure.stars.map(([point, sizeClass], i) => {
      if (sizeClass === 1) {
        const k = middle.findIndex(m => m.i === i);
        return PHASE.inner + ((1 - PHASE.inner) * (k + 0.5)) / (middle.length + 0.5);
      }
      if (point < n) {
        const round = Math.min((point - start + n) % n, (start - point + n) % n);
        return (PHASE.outline * round) / half;
      }
      const s = segments.find(q => q.kind === 'inner' && (q.near === point || q.far === point));
      return PHASE.outline + ((PHASE.inner - PHASE.outline) * ((s?.rank ?? 0) + 1)) / (s?.of ?? 1);
    });
  }
  /** Her pose now into c.flat (degrees right and up of `home`, look laid over) and c.dirs. */
  function pose(c) {
    const { actor, figure, bones, basis, flat, face, scale } = c;
    actor.root.updateMatrixWorld(true);
    inverse.copy(actor.root.matrixWorld).invert();
    const mats = c.mats ??= bones.map(() => new THREE.Matrix4());
    bones.forEach((b, i) => mats[i].multiplyMatrices(inverse, b.matrixWorld));
    const [hx, hy] = figure.home;
    const put = (i, p) => {
      flat[2 * i] = face * (p.dot(basis.right) - hx) * scale;
      flat[2 * i + 1] = (p.dot(basis.up) - hy) * scale;
    };
    const P = figure.points;
    for (let i = 0; i < c.count; i++) {
      const o = 9 * i;
      v.set(P[o + 3], P[o + 4], P[o + 5]).applyMatrix4(mats[P[o]]);
      if (P[o + 1] >= 0) {
        w.set(P[o + 6], P[o + 7], P[o + 8]).applyMatrix4(mats[P[o + 1]]);
        v.multiplyScalar(P[o + 2]).addScaledVector(w, 1 - P[o + 2]);
      }
      put(i, v);
    }
    put(c.count, v.copy(c.eye).applyMatrix4(m.multiplyMatrices(inverse, c.headBone.matrixWorld)));
    put(c.count + 1, v.setFromMatrixPosition(m.multiplyMatrices(inverse, c.pivot.matrixWorld)));
    const look = c.state.look;
    if (look) {
      const [tx, ty] = toFlat(c, look);
      const px = flat[2 * (c.count + 1)], py = flat[2 * (c.count + 1) + 1];
      const ex = flat[2 * c.count], ey = flat[2 * c.count + 1];
      let angle = Math.atan2(ty - py, tx - px) - Math.atan2(ey - py, ex - px);
      angle = Math.atan2(Math.sin(angle), Math.cos(angle));
      const turn = (i, share) => {
        if (!share) return;
        const cs = Math.cos(angle * share), sn = Math.sin(angle * share);
        const x = flat[2 * i] - px, y = flat[2 * i + 1] - py;
        flat[2 * i] = px + x * cs - y * sn;
        flat[2 * i + 1] = py + x * sn + y * cs;
      };
      for (let i = 0; i < c.count; i++) turn(i, c.turnShare[i]);
      turn(c.count, 1);
    }
    for (let i = 0; i < c.count + 2; i++) toSky(c, flat[2 * i], flat[2 * i + 1], c.dirs[i]);
  }
  const m = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  /** Degrees right and up of her home on the sky -> a direction (the tangent plane at home). */
  function toSky(c, x, y, out) {
    return out.copy(c.home).addScaledVector(c.east, Math.tan(rad(x))).addScaledVector(c.north, Math.tan(rad(y))).normalize();
  }
  function toFlat(c, { azimuth, elevation }) {
    const d = skyDirection(azimuth, elevation, tmp);
    const h = d.dot(c.home);
    return [deg(Math.atan2(d.dot(c.east), h)), deg(Math.atan2(d.dot(c.north), h))];
  }

  /** What is drawn of her: her lines' share, her stars' light. */
  function lightUp(c) {
    const { drawn, level } = c.state;
    const on = level > 0;
    const outline = on ? drawn / PHASE.outline : 0;
    const inner = on ? clamp((drawn - PHASE.outline) / (PHASE.inner - PHASE.outline), 0, 1) : 0;
    c.segments.forEach((s, i) => {
      c.shown[i] = s.kind === 'outline' ? clamp(outline * s.of - s.rank, 0, 1) : clamp(inner * s.of - s.rank, 0, 1);
    });
    c.light[0] = on ? LIGHT.star[0] * level : 0;
    c.figure.stars.forEach(([, sizeClass], k) => {
      const at = c.starAt[k];
      c.light[k + 1] = on && drawn >= at ? LIGHT.star[sizeClass] * level * smoothstep(drawn, at, at + 0.03) : 0;
      if (on && drawn >= 1) c.light[k + 1] = LIGHT.star[sizeClass] * level;
    });
  }

  function clearSlot(slot) {
    const sc = stars.geometry.getAttribute('aColor');
    const lc = lines.geometry.getAttribute('aColor');
    for (let i = 0; i < STAR_SLOT; i++) sc.setW(slot * STAR_SLOT + i, 0);
    for (let i = 0; i < 4 * LINE_SLOT; i++) lc.setW(4 * slot * LINE_SLOT + i, 0);
    sc.needsUpdate = lc.needsUpdate = true;
  }

  const starPoint = (c, k) => (k === 0 ? c.count : c.figure.stars[k - 1][0]);
  const sizeOf = (c, k) => SIZE[k === 0 ? 0 : c.figure.stars[k - 1][1]] * c.sizeScale;

  /** Her pose and light into the two buffers. */
  function write(c) {
    const sp = stars.geometry.getAttribute('position');
    const sc = stars.geometry.getAttribute('aColor');
    const ss = stars.geometry.getAttribute('aSize');
    const lp = lines.geometry.getAttribute('position');
    const lo = lines.geometry.getAttribute('aOther');
    const lc = lines.geometry.getAttribute('aColor');
    const swell = 1 + BREATH * clamp(c.state.breath, 0, 1);
    const sBase = c.slot * STAR_SLOT;
    for (let k = 0; k < STAR_SLOT; k++) {
      if (k <= c.figure.stars.length) {
        const d = c.dirs[starPoint(c, k)];
        sp.setXYZ(sBase + k, d.x * DISTANCE, d.y * DISTANCE, d.z * DISTANCE);
        sc.setXYZW(sBase + k, c.starColour.r, c.starColour.g, c.starColour.b, c.light[k]);
        ss.setX(sBase + k, Math.tan(rad(sizeOf(c, k) * swell)));
      } else sc.setW(sBase + k, 0);
    }
    const alpha = LIGHT.line * c.state.level;
    const lBase = 4 * c.slot * LINE_SLOT;
    for (let i = 0; i < LINE_SLOT; i++) {
      const k = lBase + 4 * i;
      if (i < c.segments.length && c.shown[i] > 0) {
        const s = c.segments[i];
        const a = c.dirs[s.near];
        const b = c.dirs[s.far];
        v.copy(a);
        if (c.shown[i] < 1) v.lerp(b, c.shown[i]).normalize(); else v.copy(b); // grown from the near end
        for (let j = 0; j < 4; j++) {
          const [here, there] = j < 2 ? [a, v] : [v, a];
          lp.setXYZ(k + j, here.x * DISTANCE, here.y * DISTANCE, here.z * DISTANCE);
          lo.setXYZ(k + j, there.x * DISTANCE, there.y * DISTANCE, there.z * DISTANCE);
          lc.setXYZW(k + j, c.colour.r, c.colour.g, c.colour.b, alpha);
        }
      } else if (lc.getW(k) !== 0) for (let j = 0; j < 4; j++) lc.setW(k + j, 0);
    }
    sp.needsUpdate = sc.needsUpdate = ss.needsUpdate = lp.needsUpdate = lo.needsUpdate = lc.needsUpdate = true;
  }

  function refresh(c) {
    pose(c);
    lightUp(c);
    write(c);
    let any = false;
    for (const o of all.values()) any ||= o.state.level > 0;
    stars.visible = lines.visible = any;
  }

  const get = key => {
    const c = all.get(key);
    if (!c) throw new Error(`createConstellations: no ${key}`);
    return c;
  };
  const place = d => ({ azimuth: deg(Math.atan2(d.z, d.x)), elevation: deg(Math.asin(clamp(d.y, -1, 1))) });

  return {
    group,
    add,
    set(key, { drawn = 1, level = 1, breath = 0, look = null } = {}) {
      const c = get(key);
      c.state = { drawn: clamp(Number(drawn) || 0, 0, 1), level: clamp(Number(level) || 0, 0, 1), breath: clamp(Number(breath) || 0, 0, 1), look };
      refresh(c);
    },
    starOf(key) {
      const c = get(key);
      pose(c);
      return place(c.dirs[c.count]);
    },
    pointsOf(key, out = []) {
      const c = get(key);
      pose(c);
      lightUp(c);
      out.length = 0;
      for (let k = 0; k <= c.figure.stars.length; k++) {
        const d = c.dirs[starPoint(c, k)];
        out.push({ name: k === 0 ? STAR_BONE : c.figure.stars[k - 1][2], point: k === 0 ? -1 : c.figure.stars[k - 1][0], ...place(d), direction: d.clone(), light: c.light[k], size: sizeOf(c, k) });
      }
      return out;
    },
    linesOf(key) {
      const c = get(key);
      lightUp(c);
      return c.segments.map((s, i) => ({ kind: s.kind, near: s.near, far: s.far, shown: c.shown[i] }));
    },
    drawingOf(key) {
      const c = get(key);
      pose(c);
      return c.dirs.slice(0, c.count).map(place);
    },
    outlineOf(key) {
      const c = get(key);
      pose(c);
      return c.dirs.slice(0, c.figure.outline).map(place);
    },
    skyOf(key, point) {
      const c = get(key);
      const [hx, hy] = c.figure.home;
      return place(toSky(c, c.face * (point.dot(c.basis.right) - hx) * c.scale, (point.dot(c.basis.up) - hy) * c.scale, new THREE.Vector3()));
    },
    lookPivotOf(key) {
      const c = get(key);
      pose(c);
      return place(c.dirs[c.count + 1]);
    },
    update(camera) {
      group.position.copy(camera.position);
      group.updateMatrixWorld();
      for (const c of all.values()) if (c.state.level > 0) { pose(c); lightUp(c); write(c); }
    },
    dispose() {
      world.scene.remove(group);
      for (const o of [stars, lines]) { o.geometry.dispose(); o.material.dispose(); }
      all.clear();
    },
  };
}
const DISTANCE = SKY_DISTANCE; // m from the camera, as the night sky (both at the far plane: the render order puts these over it)
