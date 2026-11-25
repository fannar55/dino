import * as THREE from 'three';
import { farPlaneDepth } from './sun-face.js';
import { seededRandom } from './random.js';

// The night sky (the festival, chapters/hatid.js scene 2 "Myrkrið, öskrið og stjörnurnar"): hundreds of stars that come out as the
// dark deepens, the zenith's first; shooting stars that fly and burst into sparks of a colour; and three ribbons of northern lights
// high over the whole sky. The look is chapter 5's flat sky (engine/sloedla/game.js: twinkling stars, falling stars with soft tails,
// three swaying curtains), here on the sky sphere.
//
// Everything hangs SKY_DISTANCE from the camera, always in the same direction from it, as the sun's face does (engine/sun-face.js),
// and is drawn at the far plane's depth (farPlaneDepth), so what stands in front of the sky hides it, however far off it is. Three
// draw calls: the stars (points), the shooting stars and their sparks (points), the ribbons (the only triangles). None is fogged or
// tone mapped. Nothing moves by itself: each part is what set(), shoot() and aurora() last told it, so a paused clock holds the
// picture and a seek lands on the same frame.
//
// Places on the sky are { azimuth, elevation } in degrees, as chapters/hatid-route.js SKY and the looks' sun have them: azimuth
// from +X toward +Z, elevation up from the horizon.

const rad = THREE.MathUtils.degToRad;
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const TAU = Math.PI * 2;

export const SKY_DISTANCE = 450; // m from the camera: inside the dome (500, engine/sky.js), beyond everything on the top
export const NIGHT = { stars: 700, low: 6, shooting: 12, sparks: 40, bands: 3 };
// The first star's place when the caller gives none: chapters/hatid-route.js SKY.first (an engine file cannot import a chapter's)
const FIRST = { azimuth: 30, elevation: 50 };
const CLEAR_COVER = 1.3; // the dome's uCover at full dark: its noise never climbs over 1, so no cloud is left
const COME_OUT = 0.06; // of `many`: how long a star takes to come out
const TAIL = 28; // points in a shooting star's tail
const TAIL_SPAN = 0.22; // of its way: the tail's length at its longest
const SPREAD_DEG = 5; // how far a burst's fastest spark flies
const DROOP_DEG = 1.6; // and how far the sparks sink as they fade
const HEAD_COLOUR = '#fff6dc'; // chapter 5's falling stars' warm white
const AURORA = ['#5effa0', '#4fd8ff', '#b07cff']; // chapter 5's three curtains
const COLUMNS = 180; // a ribbon's columns round the sky (every 2 degrees)
const ROWS = [[0, 0], [0.14, 1], [0.45, 0.55], [1, 0]]; // a ribbon's rows: up its height, and their light (bright low edge, soft top)

/** The unit vector toward `azimuth`, `elevation` (degrees), into `out`. */
export function skyDirection(azimuth, elevation, out = new THREE.Vector3()) {
  const a = rad(azimuth);
  const e = rad(elevation);
  return out.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
}

/** The point on the night sky at `azimuth`, `elevation`, as seen from `camera` now (a live point: a tap target's), into `out`. */
export function skyPoint(camera, azimuth, elevation, out = new THREE.Vector3()) {
  return skyDirection(azimuth, elevation, out).multiplyScalar(SKY_DISTANCE).add(camera.position);
}

// Points: each a soft round dot `aSize` across (the tangent of its angular diameter, so a dot is as big on the screen whatever the
// lens is but for the lens's own zoom), in `aColor`'s rgb at its alpha; `uTwinkle` sets the stars' twinkle on the clock `uTime`.
const pointsVertex = /* glsl */`
attribute vec4 aColor;
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uTwinkle;
uniform float uHeight;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * projectionMatrix[1][1] * uHeight * 0.5;
  float twinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.1 + aPhase * 2.3) + aPhase * 37.0));
  float alpha = aColor.a * twinkle * min(1.0, px / 1.6); // under 1.6 px a dot dims instead of shrinking: no flicker
  gl_PointSize = max(px, 1.6) * 1.8; // room for the soft edge
  vColor = vec4(aColor.rgb, alpha);
  if (!(aColor.a > 0.0)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // out of sight: costs no fill
}`;
const pointsFragment = /* glsl */`
varying vec4 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * (exp(-r * r * 6.0) * 0.85 + 0.15 * (1.0 - smoothstep(0.35, 0.55, r)));
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;
const ribbonVertex = /* glsl */`
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ribbonFragment = /* glsl */`
uniform float uLevel;
varying vec4 vColor;
void main() {
  gl_FragColor = vec4(vColor.rgb, vColor.a * uLevel);
  #include <colorspace_fragment>
}`;

function skyMaterial(key, vertexShader, fragmentShader, uniforms) {
  return farPlaneDepth(new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide,
  }), key);
}

function pointCloud(name, count, uniforms, key) {
  const geometry = new THREE.BufferGeometry();
  const attr = (n, size) => new THREE.BufferAttribute(new Float32Array(n * size), size);
  geometry.setAttribute('position', attr(count, 3));
  geometry.setAttribute('aColor', attr(count, 4));
  geometry.setAttribute('aSize', attr(count, 1));
  geometry.setAttribute('aPhase', attr(count, 1));
  const points = new THREE.Points(geometry, skyMaterial(key, pointsVertex, pointsFragment, uniforms));
  points.name = name;
  points.frustumCulled = false;
  points.visible = false;
  return points;
}

/** The angle between two unit vectors, in degrees. */
const apart = (a, b) => THREE.MathUtils.radToDeg(Math.acos(clamp(a.dot(b), -1, 1)));

/**
 * The night sky in `world.scene`. `count` stars (the first of them, star 0, at `first`), placed from `seed`, none under NIGHT.low
 * degrees nor inside a `clear` disc ({ azimuth, elevation, degrees }: the six stars' and the moon's places). `reduced`: a burst is
 * one soft glow and the northern lights stand still.
 *   group        the THREE.Group, in world.scene
 *   set({ dark, first, many, time })  any of them, the others kept:
 *                dark 0 to 1 thins the dome's clouds (world.sky uCover) to none and fades the Mosi cloud away;
 *                first 0 to 1 the first star's light; many 0 to 1 brings the others out, each at its own moment of it (`at`, the
 *                zenith's first), so the same numbers are always the same sky; time the twinkle's clock
 *   shoot(list)  this frame's shooting stars, [{ from: [az, el], to: [az, el], u, colour, burst }]: a head and a tail `u` (0 to 1)
 *                along the way while burst is 0; after it `burst` 0 to 1, NIGHT.sparks sparks spreading and fading in `colour` (each
 *                spark's way from the star's index in the list), or with `reduced` one glow. Draws the first NIGHT.shooting; returns
 *                how many it drew.
 *   aurora(level, time, colours)  NIGHT.bands ribbons round the whole sky, `level` 0 to 1 bright, waving on `time` (still with
 *                `reduced`), in `colours` (three; chapter 5's green, sky blue and violet unless given)
 *   starAt(i)    { index, azimuth, elevation, direction, position (in the world, as of the last update), at, light }
 *   update(camera)  hangs it all from the camera; call it after the camera has moved
 *   restore()    the dome's cover and the Mosi cloud's opacity as they were before the first dark
 *   dispose()    restores, leaves the scene and frees what it made
 */
export function createNightSky(world, { count = NIGHT.stars, seed = 7, first = FIRST, clear = [], reduced = false } = {}) {
  const group = new THREE.Group();
  group.name = 'NightSky';
  world.scene.add(group);
  const height = { value: 800 };
  const size = new THREE.Vector2();
  const measure = renderer => { height.value = renderer.getDrawingBufferSize(size).y || 800; };

  // ----------------------------------------------------------------------------- the stars
  const starUniforms = { uTime: { value: 0 }, uTwinkle: { value: 0.35 }, uHeight: height };
  const stars = pointCloud('NightStars', count, starUniforms, 'night-stars-far');
  stars.renderOrder = -3.5; // the farthest of the sky's things that blend, after the ribbons: under the sun, the moon and the clouds
  stars.onBeforeRender = measure;
  group.add(stars);
  const random = seededRandom(`night-sky ${seed}`);
  const discs = clear.map(c => ({ direction: skyDirection(c.azimuth, c.elevation), degrees: c.degrees }));
  const table = [];
  const firstDirection = skyDirection(first.azimuth, first.elevation);
  const sinLow = Math.sin(rad(NIGHT.low));
  const tints = ['#ffffff', '#fff4dc', '#ffe6c4', '#dce8ff', '#eef2ff'];
  for (let i = 0; i < count; i++) {
    let direction;
    let azimuth;
    let elevation;
    if (i === 0) {
      direction = firstDirection.clone();
      ({ azimuth, elevation } = first);
    } else {
      // even over the sphere above NIGHT.low (uniform in sin(elevation)), drawn again while it falls in a cleared disc
      for (let tries = 0; ; tries++) {
        azimuth = random() * 360 - 180;
        elevation = THREE.MathUtils.radToDeg(Math.asin(lerp(sinLow, 1, random())));
        direction = skyDirection(azimuth, elevation);
        if (!discs.some(d => apart(direction, d.direction) < d.degrees) || tries > 200) break;
      }
    }
    const lift = (Math.sin(rad(elevation)) - sinLow) / (1 - sinLow); // 0 at the lowest, 1 at the zenith
    // its moment of `many`: the zenith's early, the horizon's late, each a little its own
    const at = i === 0 ? 0 : clamp(0.6 * (1 - lift) + 0.34 * random(), 0, 1 - COME_OUT);
    // most are faint, a few bright, a handful very bright
    const r = random();
    const bright = i === 0 ? 1 : r > 0.97 ? 1 : r > 0.85 ? 0.75 : 0.32 + 0.38 * random();
    const diameter = i === 0 ? 0.62 : r > 0.97 ? 0.42 : r > 0.85 ? 0.3 : 0.16 + 0.1 * random();
    const tint = new THREE.Color(i === 0 ? '#fff8e8' : tints[Math.floor(random() * tints.length)]);
    table.push({ index: i, azimuth, elevation, direction, at, bright, light: 0 });
    const p = direction.clone().multiplyScalar(SKY_DISTANCE);
    stars.geometry.getAttribute('position').setXYZ(i, p.x, p.y, p.z);
    stars.geometry.getAttribute('aColor').setXYZW(i, tint.r, tint.g, tint.b, 0);
    stars.geometry.getAttribute('aSize').setX(i, Math.tan(rad(diameter)));
    stars.geometry.getAttribute('aPhase').setX(i, random());
  }

  // ----------------------------------------------------------------------------- the dark: the dome's cover and the Mosi cloud
  let kept = null; // what they were before the first dark: restore() gives it back
  function darken(dark) {
    const cover = world.sky?.dome?.material?.uniforms?.uCover;
    const cloud = world.scene.getObjectByName?.('MosiCloud');
    if (!kept) kept = { cover: cover?.value, opacity: cloud?.material?.opacity };
    if (cover && kept.cover !== undefined) cover.value = lerp(kept.cover, CLEAR_COVER, dark);
    if (cloud?.material && kept.opacity !== undefined) cloud.material.opacity = kept.opacity * (1 - dark);
  }
  function restore() {
    if (!kept) return;
    const cover = world.sky?.dome?.material?.uniforms?.uCover;
    const cloud = world.scene.getObjectByName?.('MosiCloud');
    if (cover && kept.cover !== undefined) cover.value = kept.cover;
    if (cloud?.material && kept.opacity !== undefined) cloud.material.opacity = kept.opacity;
    kept = null;
  }

  const state = { dark: null, first: 0, many: 0, time: 0 };
  function set({ dark, first: firstLight, many, time } = {}) {
    if (dark !== undefined) state.dark = clamp(Number(dark) || 0, 0, 1);
    if (firstLight !== undefined) state.first = clamp(Number(firstLight) || 0, 0, 1);
    if (many !== undefined) state.many = clamp(Number(many) || 0, 0, 1);
    if (time !== undefined) state.time = Number(time) || 0;
    if (state.dark !== null && dark !== undefined) darken(state.dark);
    const colour = stars.geometry.getAttribute('aColor');
    let any = false;
    for (const s of table) {
      s.light = s.index === 0 ? state.first : s.bright * smoothstep(state.many, s.at, s.at + COME_OUT);
      colour.setW(s.index, s.light);
      any ||= s.light > 0;
    }
    colour.needsUpdate = true;
    starUniforms.uTime.value = state.time;
    stars.visible = any;
  }

  // ----------------------------------------------------------------------------- the shooting stars and their sparks
  const shootUniforms = { uTime: { value: 0 }, uTwinkle: { value: 0 }, uHeight: height };
  const slot = 1 + TAIL + NIGHT.sparks;
  const shooting = pointCloud('NightShooting', NIGHT.shooting * slot, shootUniforms, 'night-shooting-far');
  shooting.renderOrder = -3; // over the stars
  shooting.onBeforeRender = measure;
  group.add(shooting);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const v = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const white = new THREE.Color(HEAD_COLOUR);
  const tone = new THREE.Color();
  const mixed = new THREE.Color();
  const sparkWays = []; // each index's sparks: [angle, speed, sparkle phase], the same every time
  const waysOf = index => {
    if (!sparkWays[index]) {
      const r = seededRandom(`night-sparks ${seed} ${index}`);
      sparkWays[index] = Array.from({ length: NIGHT.sparks }, (_, j) => [TAU * (j + 0.8 * r()) / NIGHT.sparks, 0.35 + 0.65 * r(), r() * TAU]);
    }
    return sparkWays[index];
  };
  function shoot(list = []) {
    const position = shooting.geometry.getAttribute('position');
    const colour = shooting.geometry.getAttribute('aColor');
    const sizes = shooting.geometry.getAttribute('aSize');
    let n = 0;
    const put = (direction, c, alpha, diameter) => {
      position.setXYZ(n, direction.x * SKY_DISTANCE, direction.y * SKY_DISTANCE, direction.z * SKY_DISTANCE);
      colour.setXYZW(n, c.r, c.g, c.b, alpha);
      sizes.setX(n, Math.tan(rad(diameter)));
      n++;
    };
    const drawnStars = Math.min(list.length, NIGHT.shooting);
    for (let index = 0; index < drawnStars; index++) {
      const star = list[index];
      skyDirection(star.from[0], star.from[1], a);
      skyDirection(star.to[0], star.to[1], b);
      const way = a.angleTo(b);
      axis.crossVectors(a, b);
      if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0); else axis.normalize();
      tone.set(star.colour ?? HEAD_COLOUR);
      const burst = clamp(Number(star.burst) || 0, 0, 1);
      if (burst >= 1) continue;
      if (burst > 0) {
        // the burst, where it ended
        if (reduced) {
          put(b, tone, 0.8 * (1 - burst) ** 2, 2.6 * (0.6 + 0.4 * burst));
          continue;
        }
        east.crossVectors(UP, b);
        if (east.lengthSq() < 1e-9) east.set(1, 0, 0); else east.normalize();
        north.crossVectors(b, east).normalize();
        const out = 1 - (1 - burst) ** 2.2; // fast out, slowing
        mixed.copy(white).lerp(tone, Math.min(1, burst * 4)); // white-hot at the start, its colour from a quarter on
        for (const [angle, speed, phase] of waysOf(index)) {
          const far = rad(SPREAD_DEG * speed * out);
          const x = Math.cos(angle) * far;
          const y = Math.sin(angle) * far - rad(DROOP_DEG) * burst * burst;
          v.copy(b).addScaledVector(east, Math.tan(x)).addScaledVector(north, Math.tan(y)).normalize();
          const sparkle = 0.65 + 0.35 * Math.sin(burst * 46 + phase);
          put(v, mixed, Math.min(1, 1.4 * (1 - burst) ** 1.1 * sparkle), 0.46 * (1 - 0.45 * burst));
        }
        continue;
      }
      // on its way: the head at u, the tail behind it, white going to its colour toward the end
      const u = clamp(Number(star.u) || 0, 0, 1);
      const show = smoothstep(u, 0, 0.06);
      put(v.copy(a).applyAxisAngle(axis, way * u), white, show, 0.55);
      const span = Math.min(TAIL_SPAN, u);
      for (let k = 1; k <= TAIL; k++) {
        const s = k / TAIL;
        mixed.copy(white).lerp(tone, Math.sqrt(s));
        put(v.copy(a).applyAxisAngle(axis, way * (u - span * s)), mixed, show * 0.85 * (1 - s) ** 1.5, 0.42 - 0.3 * s);
      }
    }
    shooting.geometry.setDrawRange(0, n);
    position.needsUpdate = colour.needsUpdate = sizes.needsUpdate = true;
    shooting.visible = n > 0;
    return drawnStars;
  }

  // ----------------------------------------------------------------------------- the northern lights
  const ribbonGeometry = new THREE.BufferGeometry();
  const perRibbon = (COLUMNS + 1) * ROWS.length;
  const verts = NIGHT.bands * perRibbon;
  ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  ribbonGeometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(verts * 4), 4));
  const index = [];
  for (let k = 0; k < NIGHT.bands; k++) {
    for (let c = 0; c < COLUMNS; c++) {
      for (let r = 0; r < ROWS.length - 1; r++) {
        const i0 = k * perRibbon + c * ROWS.length + r;
        const i1 = i0 + ROWS.length;
        index.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
      }
    }
  }
  ribbonGeometry.setIndex(index);
  const ribbonUniforms = { uLevel: { value: 0 } };
  const ribbons = new THREE.Mesh(ribbonGeometry, skyMaterial('night-ribbons-far', ribbonVertex, ribbonFragment, ribbonUniforms));
  ribbons.name = 'NightLights';
  ribbons.frustumCulled = false;
  ribbons.visible = false;
  ribbons.renderOrder = -4;
  group.add(ribbons);
  const ribbonColour = new THREE.Color();
  function aurora(level = 0, time = 0, colours = AURORA) {
    const t = reduced ? 0 : Number(time) || 0;
    ribbonUniforms.uLevel.value = clamp(Number(level) || 0, 0, 1) * 0.55;
    ribbons.visible = ribbonUniforms.uLevel.value > 0;
    const position = ribbonGeometry.getAttribute('position');
    const colour = ribbonGeometry.getAttribute('aColor');
    for (let k = 0; k < NIGHT.bands; k++) {
      ribbonColour.set(colours?.[k] ?? AURORA[k % AURORA.length]);
      for (let c = 0; c <= COLUMNS; c++) {
        const az = (c / COLUMNS) * TAU;
        const base = 24 + 12 * k + 6 * Math.sin(2 * az + t * (0.25 + 0.07 * k) + 2 * k) + 2 * Math.sin(5 * az - t * 0.4 + k);
        const tall = 16 + 4 * Math.sin(3 * az + t * 0.3 + k);
        // the curtains: brighter in parts of the sky, and rays shimmering along them
        const part = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(az + k * 2.1 + t * 0.05));
        const shimmer = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(az * 37 + t * 1.7 + k * 7) * Math.sin(az * 11 - t * 0.45 + k));
        for (let r = 0; r < ROWS.length; r++) {
          const [up, light] = ROWS[r];
          const i = k * perRibbon + c * ROWS.length + r;
          skyDirection(THREE.MathUtils.radToDeg(az), base + tall * up, v).multiplyScalar(SKY_DISTANCE);
          position.setXYZ(i, v.x, v.y, v.z);
          colour.setXYZW(i, ribbonColour.r, ribbonColour.g, ribbonColour.b, light * part * shimmer);
        }
      }
    }
    position.needsUpdate = colour.needsUpdate = true;
  }

  return {
    group,
    set,
    shoot,
    aurora,
    starAt(i) {
      const s = table[i];
      return { ...s, direction: s.direction.clone(), position: s.direction.clone().multiplyScalar(SKY_DISTANCE).add(group.position) };
    },
    update(camera) {
      group.position.copy(camera.position);
      group.updateMatrixWorld();
    },
    restore,
    dispose() {
      restore();
      world.scene.remove(group);
      for (const o of [stars, shooting, ribbons]) {
        o.geometry.dispose();
        o.material.dispose();
      }
    },
  };
}
