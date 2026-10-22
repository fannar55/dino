// The Fen's water: pools and one slow channel, drawn as one smooth surface with no reflection and no post-processing
// (STYLE.md 11). Teal where it is deep, the bed's mud through the shallows, sky-coloured toward the horizon, a warm sheen
// and a glitter toward the look's sun, rings where something touches it, and a few bubbles rising out of the mud.
//
//   waterShape(spec, { level })  the water's outline and beds, as pure functions (the forest shapes its ground with them):
//                                { level, signedAt(x, z), nearest(x, z) -> { s, depth, flow }, bedAt(x, z), bounds, pools, line }
//   createWater(world, spec, heightAt, { spots, seed, centre }) ->
//     { group, shape, update(t), surfaceAt(x, z) -> y | null, depthAt(x, z), rippleAt(point, strength = 1) -> Handle,
//       bubblesAt(point) -> Handle, wade(actors), dispose() }
//   createWaterMaterial(world, { seed, fade, prints }) -> { material, uniforms, dispose() }: the surface's own material, for
//                                water drawn somewhere else in the same look (world/props/mud-prints.js: the water in
//                                Þórseðla's footprints); `prints` adds what a print's water does (aState: still and gold, glimmer)
//
// spec = { pools: [{ center: [x, z], radius, depth }], channel: { line: [[x, z], ...], width, depth } } (a place's
// layout.water). All the water lies at one level, `level` metres from the place's clearing centre (FEN.waterLevel): the
// forest digs each pool and the channel out of a calm floor to its depth below it (forest.js: the lift), so the bed under the
// surface is what heightAt says and the actors who stand in the water stand on it. A pool's edge wobbles a little round its
// circle; the channel is the line smoothed into a curve, its width breathing along it. signedAt is the distance to the
// nearest edge, negative inside the water.
//
// One mesh: a grid laid over the water, a metre a cell near the middle of the place and 2.5 m far out, each vertex carrying
// its distance to the shore and its depth. The surface fades out over the last FADE metres inside the edge, where the bank
// meets it, so no line shows where the water meets the ground; and shallow water is clearer, so the mud of the bank shows
// through. It is teal where it is deep and reflects the look's sky (its horizon to its zenith, and the far treeline low down) by
// a Schlick fresnel; the small waves fade out with distance. Rings are up to RIPPLES live in the material's uniforms: the
// script's (rippleAt), faint ones round the feet of whoever stands in the water (wade, which forest.update calls with the
// actors), and, in slots of their own, faint ones that start by themselves now and then at one of `spots` (roots, stones, reed,
// lily pads). Bubbles are one small set of soft points, drawn only while some rise. The water's clock is the game's (update(t)
// with the forest's time), so a capture freezes it, and it follows the look's sun as it is now.
import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { FEN } from '../forest/config.js';
import { createNoiseTexture } from '../forest/materials.js';
import { clamp, smoothstep, hash2 } from '../forest/random.js';

const EDGE_DROP = 0.03; // m the bed lies below the surface at the very edge, so the two never touch where the water shows
const FADE = 0.4; // m over which the surface fades out inside its edge
const RIPPLES = 8;
const RIPPLE = { life: 2.6, speed: 0.55 }; // s a ring lives, m/s it spreads
const BUBBLES = 32;
const FLOW = 0.22; // m/s the channel drifts
const NEAR = 45; // m from the place's centre within which the grid is fine
const CELL = { near: 1.0, far: 2.5 };
const AMBIENT = 1.4; // s between the faint rings that start by themselves
const AMBIENT_SLOTS = 2; // ring slots kept for them, so they never push out a ring the script made
const WADE = 2.0; // s between two rings at the same foot of whoever stands in the water
const PRINT_GOLD = '#f0bf4c'; // a counted footprint's water shows the sky in this warm gold (the star's)

const wobble = (k, salt) => hash2(k, salt, 0x51f) * Math.PI * 2;

/** A Catmull-Rom curve through the points, sampled every `step` metres or so. */
function smoothLine(points, step = 1.2) {
  if (points.length < 2) return points.map(p => [...p]);
  const out = [];
  const at = i => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([...points[points.length - 1]]);
  return out;
}

/**
 * The water's shape, as pure functions of a point on the ground. `level` is the height of its surface (in the place's
 * heightAt, whose clearing centre is 0); `reach` how far round the channel nearest() needs to be right (beyond it, it says
 * only that the point is far from it).
 */
export function waterShape(spec = {}, { level = FEN.waterLevel, reach = 26 } = {}) {
  const pools = (spec.pools ?? []).map((p, k) => ({
    x: p.center[0], z: p.center[1], radius: p.radius, depth: p.depth,
    phase: [wobble(k, 1), wobble(k, 2), wobble(k, 3)],
  }));
  const poolS = (p, x, z) => {
    const dx = x - p.x, dz = z - p.z;
    const a = Math.atan2(dz, dx);
    const R = p.radius * (1 + 0.08 * Math.sin(3 * a + p.phase[0]) + 0.05 * Math.sin(5 * a + p.phase[1]) + 0.025 * Math.sin(8 * a + p.phase[2]));
    return Math.hypot(dx, dz) - R;
  };

  // the channel: a smoothed line, its segments in a grid of cells so a point asks only the few near it
  const channel = spec.channel ? { ...spec.channel } : null;
  const line = channel ? smoothLine(channel.line) : [];
  const segs = [];
  let grid = null;
  if (channel) {
    let s0 = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1e-6;
      segs.push({ ax, az, dx: bx - ax, dz: bz - az, len, s0 });
      s0 += len;
    }
    const pad = reach + channel.width;
    const xs = line.map(p => p[0]), zs = line.map(p => p[1]);
    const cell = 8;
    const ox = Math.min(...xs) - pad, oz = Math.min(...zs) - pad;
    const nx = Math.ceil((Math.max(...xs) + pad - ox) / cell) + 1, nz = Math.ceil((Math.max(...zs) + pad - oz) / cell) + 1;
    const cells = Array.from({ length: nx * nz }, () => []);
    segs.forEach((g, i) => {
      const x0 = Math.floor((Math.min(g.ax, g.ax + g.dx) - pad - ox) / cell), x1 = Math.floor((Math.max(g.ax, g.ax + g.dx) + pad - ox) / cell);
      const z0 = Math.floor((Math.min(g.az, g.az + g.dz) - pad - oz) / cell), z1 = Math.floor((Math.max(g.az, g.az + g.dz) + pad - oz) / cell);
      for (let j = Math.max(0, z0); j <= Math.min(nz - 1, z1); j++) for (let k = Math.max(0, x0); k <= Math.min(nx - 1, x1); k++) cells[j * nx + k].push(i);
    });
    grid = { ox, oz, cell, nx, nz, cells };
    channel.phase = [wobble(99, 1), wobble(99, 2)];
  }
  /** Distance to the channel's middle, the arc length there and the segment, or null when the point is far from it. */
  function channelNear(x, z) {
    if (!grid) return null;
    const k = Math.floor((x - grid.ox) / grid.cell), j = Math.floor((z - grid.oz) / grid.cell);
    if (!(k >= 0 && j >= 0 && k < grid.nx && j < grid.nz)) return null; // (NaN too)
    const list = grid.cells[j * grid.nx + k];
    if (!list.length) return null;
    let best = Infinity, bestS = 0, bestSeg = null;
    for (const i of list) {
      const g = segs[i];
      const t = clamp(((x - g.ax) * g.dx + (z - g.az) * g.dz) / (g.len * g.len), 0, 1);
      const d = Math.hypot(x - g.ax - g.dx * t, z - g.az - g.dz * t);
      if (d < best) { best = d; bestS = g.s0 + g.len * t; bestSeg = g; }
    }
    return { d: best, s: bestS, seg: bestSeg };
  }
  const halfWidth = s => (channel.width / 2) * (1 + 0.12 * Math.sin(s * 0.13 + channel.phase[0]) + 0.06 * Math.sin(s * 0.31 + channel.phase[1]));

  const FAR = { s: Infinity, depth: 0, flow: [0, 0] };
  /** The nearest water's signed distance (m, negative inside), its depth and how it drifts (m/s). */
  function nearest(x, z) {
    let best = FAR;
    for (const p of pools) {
      const s = poolS(p, x, z);
      if (s < best.s) best = { s, depth: p.depth, flow: [0, 0] };
    }
    const c = channelNear(x, z);
    if (c) {
      const s = c.d - halfWidth(c.s);
      if (s < best.s) best = { s, depth: channel.depth, flow: [(c.seg.dx / c.seg.len) * FLOW, (c.seg.dz / c.seg.len) * FLOW] };
    }
    return best;
  }
  const signedAt = (x, z) => nearest(x, z).s;
  /** The bed's height under the water (null on dry land): EDGE_DROP below the surface at the edge, `depth` in the middle. */
  function bedAt(x, z) {
    const { s, depth } = nearest(x, z);
    if (!(s < 0)) return null;
    return level - (EDGE_DROP + (depth - EDGE_DROP) * smoothstep(0, 2.5 * depth, -s));
  }
  // the ground the water covers, as rectangles to lay the grid over
  const bounds = pools.map(p => [p.x - p.radius * 1.2 - 1, p.z - p.radius * 1.2 - 1, p.x + p.radius * 1.2 + 1, p.z + p.radius * 1.2 + 1]);
  for (const g of segs) {
    const w = channel.width * 0.75 + 1;
    bounds.push([Math.min(g.ax, g.ax + g.dx) - w, Math.min(g.az, g.az + g.dz) - w, Math.max(g.ax, g.ax + g.dx) + w, Math.max(g.az, g.az + g.dz) + w]);
  }
  return { level, edgeDrop: EDGE_DROP, fade: FADE, pools, line, signedAt, nearest, bedAt, bounds };
}

// ---------------------------------------------------------------------------------------------
// The surface

const SURFACE_VERT = /* glsl */`
attribute vec3 aWater; // x: distance to the shore (m, negative inside), y: depth (m)
attribute vec2 aFlow; // m/s the water drifts
varying vec3 vWorld;
varying vec2 vWater;
varying vec2 vFlow;
#ifdef PRINT_WATER
attribute vec2 aState; // a footprint's water: x 0 to 1 still and gold (counted), y 0 to 1 glimmering (the next to count)
attribute vec2 aLocal; // where in the print's own frame (metres along it, to its right): its shore is drawn from its shape
varying vec2 vState;
varying vec2 vLocal;
#endif
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  vWater = aWater.xy;
  vFlow = aFlow;
  #ifdef PRINT_WATER
  vState = aState;
  vLocal = aLocal;
  #endif
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SURFACE_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uTreeline;
uniform vec3 uBed;
uniform vec3 uGlint;
uniform vec3 uSunDir;
uniform sampler2D uNoise;
uniform vec4 uRipples[ ${RIPPLES} ]; // x, z, the time it began, strength (0: none)
uniform float uFade;
varying vec3 vWorld;
varying vec2 vWater;
varying vec2 vFlow;
#ifdef PRINT_WATER
uniform vec3 uGold;
uniform vec4 uBlobs[ 4 ]; // the print's pad and three toes: x, z, radius along, radius across (mud-prints.js)
varying vec2 vState;
varying vec2 vLocal;
// the print's signed distance (m, negative inside): the nearest of its four ellipses, to first order (as mud-prints.js has it)
float printDistance( vec2 p ) {
  float d = 1e3;
  for ( int i = 0; i < 4; i ++ ) {
    vec4 b = uBlobs[ i ];
    vec2 u = p - b.xy;
    float k = length( u / b.zw );
    float g = length( u / ( b.zw * b.zw ) );
    d = min( d, g < 1e-6 ? - min( b.z, b.w ) : ( k - 1.0 ) * k / g );
  }
  return d;
}
#endif
#include <common>
#include <fog_pars_fragment>
float waterHeight( vec2 p ) {
  // two layers of soft noise drifting against each other, and with the channel's flow
  vec2 drift = vFlow * uTime;
  float a = texture2D( uNoise, ( p - drift ) * 0.19 + vec2( uTime * 0.012, uTime * 0.008 ) ).g;
  float b = texture2D( uNoise, ( p - drift * 1.4 ) * 0.43 - vec2( uTime * 0.019, -uTime * 0.014 ) ).b;
  return a * 0.6 + b * 0.4;
}
void main() {
  vec2 p = vWorld.xz;
  // the small waves fade out with distance, so far water lies smooth and reflects the sky
  float detail = 1.0 - smoothstep( 12.0, 35.0, length( cameraPosition - vWorld ) );
  #ifdef PRINT_WATER
  detail *= 1.0 - 0.85 * vState.x; // a counted print's water lies still
  #endif
  float e = 0.12;
  float h0 = waterHeight( p );
  vec2 grad = vec2( waterHeight( p + vec2( e, 0.0 ) ) - h0, waterHeight( p + vec2( 0.0, e ) ) - h0 ) / e;
  // rings: a crest spreading from where something touched the water, and a fainter one inside it
  vec2 tilt = vec2( 0.0 );
  float crest = 0.0;
  for ( int i = 0; i < ${RIPPLES}; i ++ ) {
    vec4 r = uRipples[ i ];
    float age = uTime - r.z;
    if ( r.w <= 0.0 || age < 0.0 || age > ${RIPPLE.life.toFixed(2)} ) continue;
    vec2 d = p - r.xy;
    float dist = length( d );
    float radius = 0.12 + ${RIPPLE.speed.toFixed(2)} * age;
    float width = 0.07 + 0.05 * age;
    float fade = 1.0 - age / ${RIPPLE.life.toFixed(2)};
    fade *= fade * r.w;
    for ( int k = 0; k < 2; k ++ ) {
      float x = ( dist - radius * ( k == 0 ? 1.0 : 0.62 ) ) / width;
      float w = exp( -x * x ) * fade * ( k == 0 ? 1.0 : 0.5 );
      crest += w;
      tilt += ( d / max( dist, 1e-3 ) ) * ( -x * w );
    }
  }
  vec3 n = normalize( vec3( -grad.x * 0.07 * detail - tilt.x * 0.35, 1.0, -grad.y * 0.07 * detail - tilt.y * 0.35 ) );
  vec3 v = normalize( cameraPosition - vWorld );
  float facing = max( dot( n, v ), 0.0 );
  float fresnel = 0.02 + 0.98 * pow( 1.0 - facing, 5.0 ); // Schlick
  // the body: deep teal, the olive silt of the bed only in the shallows at the edge
  float deep = smoothstep( 0.03, 0.25, vWater.y );
  vec3 body = mix( uBed, uDeep, deep );
  // the sky it reflects: the look's sky from just over its hazy horizon to its zenith, the far treeline along the bottom of it;
  // a pond in reeds reflects less than open water, so the teal shows through
  vec3 rr = reflect( -v, n );
  vec3 sky = mix( mix( uHorizon, uZenith, 0.45 ), uZenith, smoothstep( 0.0, 0.55, rr.y ) );
  sky = mix( sky, uTreeline, smoothstep( 0.14, 0.03, rr.y ) * 0.8 );
  vec3 col = mix( body, sky, fresnel * 0.6 );
  // toward the sun: a broad warm sheen, the sun's own glint and a glitter of small sparks where the surface turns to it
  float sun = max( dot( rr, uSunDir ), 0.0 );
  float sheen = pow( sun, 10.0 ) * 0.16;
  float glint = pow( sun, 420.0 ) * 1.8;
  float sparks = smoothstep( 0.7, 0.92, texture2D( uNoise, p * 2.1 + vec2( uTime * 0.07, -uTime * 0.05 ) ).a )
    * smoothstep( 0.62, 0.9, texture2D( uNoise, p * 2.9 - vec2( uTime * 0.05, uTime * 0.06 ) ).r );
  float glitter = sparks * pow( sun, 28.0 ) * 4.0;
  col += uGlint * ( sheen + glint + glitter );
  col = mix( col, uHorizon * 1.05, clamp( crest * 0.45, 0.0, 0.6 ) );
  // the edge fades over the last metres inside it; shallow water is clearer
  float shore = smoothstep( 0.0, uFade, -vWater.x );
  float alpha = shore * clamp( mix( 0.8, 0.95, deep ) + fresnel * 0.3 + glint + glitter + crest * 0.2, 0.0, 1.0 );
  #ifdef PRINT_WATER
  // A footprint's water: a few centimetres over a mud floor. Its shore is the print's own shape, per pixel. Looking down it is
  // clear (the dark floor, lit or in shade as the mud is, shows through it); looking along it, it shows the sky. Counted, it lies
  // still, a warm amber over its floor, the sky in it gold (the sky times the gold: mixed in, a bright sky turns it to sand), with
  // a gold line where the light catches its shore and gold in its sheen and sparks. The next to count glimmers: its sparks twinkle
  // whatever the sun, and a ring of light goes out from the middle of the pad again and again. A ring where something touched it
  // shows in its tilt and a thin crest, not a wash of white over so small a water.
  float pd = printDistance( vLocal );
  float printShore = smoothstep( 0.0, uFade, - pd );
  if ( printShore <= 0.0 ) discard;
  float done = vState.x;
  vec3 floorTint = mix( uBed, uDeep * 0.7, 0.3 * smoothstep( 0.0, 0.25, - pd ) );
  floorTint = mix( floorTint, uGold * 0.35, 0.6 * done );
  col = mix( floorTint, sky * mix( vec3( 1.0 ), uGold * vec3( 1.35, 1.1, 1.0 ), done ), fresnel * 0.9 );
  float rim = ( - pd - 0.03 ) / 0.018;
  float goldRim = exp( - rim * rim ) * done;
  col += uGold * ( goldRim * 0.55 + sparks * done * 0.9 );
  col += mix( uGlint, uGold, done ) * ( sheen * ( 1.0 + 2.0 * done ) + glint + glitter * ( 1.0 + done ) );
  float run = fract( uTime * 0.6 );
  float wave = ( length( vLocal - uBlobs[ 0 ].xy ) - run * 0.42 ) / 0.03;
  float lightRing = exp( - wave * wave ) * ( 1.0 - run ) * vState.y;
  float twinkle = sparks * vState.y * 2.5;
  col += uGlint * ( lightRing * 0.9 + twinkle );
  col = mix( col, uHorizon * 1.05, clamp( crest * crest * 0.3, 0.0, 0.3 ) );
  alpha = printShore * clamp( 0.5 + fresnel * 0.5 + goldRim * 0.4 + glint + glitter + crest * 0.15 + lightRing * 0.6 + twinkle * 0.5, 0.0, 1.0 );
  #endif
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const BUBBLE_VERT = /* glsl */`
attribute vec4 aBubble; // x: birth (s), y: seconds to rise, z: metres it rises, w: size (m)
uniform float uTime;
uniform float uPixelScale;
varying float vAlive;
#include <common>
#include <fog_pars_vertex>
void main() {
  float t = ( uTime - aBubble.x ) / aBubble.y;
  vAlive = step( 0.0, t ) * step( t, 1.0 );
  vec3 p = position + vec3( 0.03 * sin( t * 9.0 + aBubble.x * 7.0 ), aBubble.z * t, 0.03 * cos( t * 7.0 + aBubble.x * 5.0 ) );
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = vAlive * aBubble.w * uPixelScale / max( 0.2, -mvPosition.z ) * ( 0.7 + 0.3 * t );
  #include <fog_vertex>
}`;

const BUBBLE_FRAG = /* glsl */`
uniform vec3 uColour;
varying float vAlive;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot( q, q );
  if ( r2 > 1.0 || vAlive < 0.5 ) discard;
  float rim = smoothstep( 0.45, 0.95, r2 ) * ( 1.0 - smoothstep( 0.95, 1.0, r2 ) );
  float shine = exp( -dot( q - vec2( -0.35, 0.35 ), q - vec2( -0.35, 0.35 ) ) * 14.0 );
  gl_FragColor = vec4( uColour, clamp( rim * 0.7 + shine * 0.9 + 0.08, 0.0, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** A point given as a Vector3, [x, y, z] or { x, z }, as [x, z]. */
const groundOf = point => (Array.isArray(point) ? [point[0], point.length > 2 ? point[2] : point[1]] : [point.x, point.z]);

export function createWater(world, spec, heightAt, { spots = [], seed = 12, centre = [0, 0], level } = {}) {
  const shape = waterShape(spec, level === undefined ? {} : { level });
  const group = new THREE.Group();
  group.name = 'Water';

  // ---- the surface: a grid over the water, fine near the middle of the place and coarse far out ----
  const pos = [], water = [], flow = [], idx = [];
  const vertex = new Map(); // "step:i:j" -> index
  const vertexAt = (step, i, j) => {
    const key = `${step}:${i}:${j}`;
    let v = vertex.get(key);
    if (v !== undefined) return v;
    const x = i * step, z = j * step;
    const near = shape.nearest(x, z);
    v = pos.length / 3;
    pos.push(x, shape.level, z);
    water.push(Math.min(near.s, 50), Math.max(0, shape.level - heightAt(x, z)), 0);
    flow.push(near.flow[0], near.flow[1]);
    vertex.set(key, v);
    return v;
  };
  const cells = new Set();
  const [cx, cz] = centre;
  for (const [x0, z0, x1, z1] of shape.bounds) {
    for (const step of [CELL.near, CELL.far]) {
      for (let j = Math.floor(z0 / step); j <= Math.ceil(z1 / step); j++) {
        for (let i = Math.floor(x0 / step); i <= Math.ceil(x1 / step); i++) {
          const mx = (i + 0.5) * step, mz = (j + 0.5) * step;
          // a fine cell near the middle, a coarse one far out: every point of the water is in one of the two
          if ((Math.hypot(mx - cx, mz - cz) < NEAR) !== (step === CELL.near)) continue;
          const key = `${step}:${i}:${j}`;
          if (cells.has(key)) continue;
          // a cell is drawn when the water reaches into it: one of its corners, or its middle, is inside
          const inside = shape.signedAt(mx, mz) < 0
            || [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].some(([a, b]) => shape.signedAt(a * step, b * step) < 0);
          if (!inside) continue;
          cells.add(key);
          const a = vertexAt(step, i, j), b = vertexAt(step, i + 1, j), c = vertexAt(step, i, j + 1), d = vertexAt(step, i + 1, j + 1);
          idx.push(a, c, b, b, c, d);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aWater', new THREE.Float32BufferAttribute(water, 3));
  geometry.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  const { material, uniforms, dispose: disposeMaterial } = createWaterMaterial(world, { seed });
  const ripples = uniforms.uRipples.value;
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'Water surface';
  surface.renderOrder = 8;
  group.add(surface);

  // ---- bubbles: soft points rising from the mud, drawn only while some rise ----
  const bubblePos = new Float32Array(BUBBLES * 3);
  const bubbleData = new Float32Array(BUBBLES * 4);
  for (let i = 0; i < BUBBLES; i++) bubbleData[i * 4] = -99;
  const bubbleGeometry = new THREE.BufferGeometry();
  bubbleGeometry.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
  bubbleGeometry.setAttribute('aBubble', new THREE.BufferAttribute(bubbleData, 4));
  const bubbleUniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uPixelScale: { value: 800 },
    uColour: { value: new THREE.Color('#eef6f0') },
  };
  const bubbleMaterial = new THREE.ShaderMaterial({
    vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, uniforms: bubbleUniforms,
    fog: true, transparent: true, depthWrite: false,
  });
  bubbleMaterial.name = 'fen-bubbles';
  const bubbles = new THREE.Points(bubbleGeometry, bubbleMaterial);
  bubbles.name = 'Water bubbles';
  bubbles.frustumCulled = false;
  bubbles.renderOrder = 9;
  bubbles.visible = false;
  const viewport = new THREE.Vector2();
  bubbles.onBeforeRender = (renderer, scene, camera) => {
    renderer.getDrawingBufferSize(viewport);
    bubbleUniforms.uPixelScale.value = viewport.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  };
  group.add(bubbles);

  let now = 0;
  const live = []; // rings and bubble sets with their handles, and bubbles still to break on the surface
  let nextBubble = 0, bubblesUntil = -1;
  let ambientTick = -1;
  // Who each ring slot belongs to: the first AMBIENT_SLOTS are the faint rings that start by themselves; the others are for the
  // script's rings (rippleAt) and for the rings round the feet of whoever wades (wade), which never push a script's ring out.
  const owner = Array.from({ length: RIPPLES }, (_, i) => (i < AMBIENT_SLOTS ? 'ambient' : 'free'));
  const expired = i => ripples[i].w <= 0 || now - ripples[i].z > RIPPLE.life || ripples[i].z > now;

  const surfaceAt = (x, z) => (shape.signedAt(x, z) < 0 ? shape.level : null);
  const depthAt = (x, z) => (shape.signedAt(x, z) < 0 ? Math.max(0, shape.level - heightAt(x, z)) : 0);
  /** A slot for a ring of `kind` ('play' or 'wade'): a free or spent one; else a wading ring's (for 'play' only), else the oldest. */
  function slotFor(kind) {
    let pick = -1;
    for (let i = AMBIENT_SLOTS; i < RIPPLES; i++) if (expired(i)) return i;
    if (kind === 'wade') return -1;
    for (let i = AMBIENT_SLOTS; i < RIPPLES; i++) if (owner[i] === 'wade' && (pick < 0 || ripples[i].z < ripples[pick].z)) pick = i;
    if (pick >= 0) return pick;
    for (let i = AMBIENT_SLOTS; i < RIPPLES; i++) if (pick < 0 || ripples[i].z < ripples[pick].z) pick = i;
    return pick;
  }

  /** A ring spreading from a point on the water (a Vector3, [x, y, z] or { x, z }); strength 1 is a footstep's. */
  function rippleAt(point, strength = 1, kind = 'play') {
    const [x, z] = groundOf(point);
    const slot = slotFor(kind);
    const handle = new Handle('ripple');
    if (slot < 0) return handle.finish();
    const began = now;
    ripples[slot].set(x, z, began, Math.max(0, strength));
    owner[slot] = kind;
    handle.onCancel = () => { if (ripples[slot].z === began) ripples[slot].w = 0; };
    live.push({ handle, end: began + RIPPLE.life });
    return handle;
  }

  /** A few bubbles rising out of the mud at a point and breaking on the surface, each with a faint ring. */
  function bubblesAt(point) {
    const [x, z] = groundOf(point);
    const bed = heightAt(x, z);
    const rise = Math.max(0.05, shape.level - bed);
    let end = now;
    for (let k = 0; k < 6; k++) {
      const i = nextBubble;
      nextBubble = (nextBubble + 1) % BUBBLES;
      const r = hash2(Math.round(now * 1000) + k, i, 7);
      const birth = now + k * 0.22 + r * 0.15;
      const seconds = 0.7 + 0.5 * hash2(i, k, 9);
      const bx = x + (r - 0.5) * 0.3, bz = z + (hash2(k, i, 11) - 0.5) * 0.3;
      bubblePos.set([bx, bed + 0.02, bz], i * 3);
      bubbleData.set([birth, seconds, rise, 0.035 + 0.035 * hash2(i, k, 13)], i * 4);
      end = Math.max(end, birth + seconds);
      live.push({ pop: [bx, bz], at: birth + seconds });
    }
    bubbleGeometry.attributes.position.needsUpdate = true;
    bubbleGeometry.attributes.aBubble.needsUpdate = true;
    bubblesUntil = Math.max(bubblesUntil, end);
    bubbles.visible = true;
    const handle = new Handle('bubbles');
    live.push({ handle, end });
    return handle;
  }

  // Whoever stands in the water makes faint rings round their feet, one foot after another, each foot every WADE seconds.
  const waders = new Map(); // actor -> { feet, k, next }
  const footAt = new THREE.Vector3();
  /** Rings at the feet of every actor (with a root and bones named "…Foot…") whose feet are in the water. */
  function wade(actors) {
    for (const actor of actors) {
      const root = actor?.root;
      if (!root || !root.visible) continue;
      let w = waders.get(actor);
      if (!w) {
        const feet = [];
        (actor.model ?? root).traverse(o => { if (o.isBone && /Foot/.test(o.name)) feet.push(o); });
        w = { feet, k: 0, next: now };
        waders.set(actor, w);
      }
      if (!w.feet.length) continue;
      if (w.next - now > WADE) w.next = now; // the clock went back (a seek)
      if (now < w.next) continue;
      const foot = w.feet[w.k % w.feet.length];
      w.k++;
      w.next = now + WADE / w.feet.length;
      foot.getWorldPosition(footAt);
      if (depthAt(footAt.x, footAt.z) < 0.05) continue;
      rippleAt([footAt.x, 0, footAt.z], 0.3 + 0.12 * hash2(w.k, seed, 17), 'wade');
    }
  }

  function update(t) {
    now = t;
    uniforms.uTime.value = t;
    bubbleUniforms.uTime.value = t;
    if (world.lighting?.direction) uniforms.uSunDir.value.copy(world.lighting.direction); // a later look's sun is followed
    // now and then a faint ring at a root, a stone, a reed or a lily pad, chosen by the clock so a capture shows the same ones
    if (spots.length) {
      const tick = Math.floor(t / AMBIENT);
      if (tick !== ambientTick) {
        ambientTick = tick;
        const spot = spots[Math.floor(hash2(tick, seed, 3) * spots.length) % spots.length];
        ripples[((tick % AMBIENT_SLOTS) + AMBIENT_SLOTS) % AMBIENT_SLOTS].set(spot[0], spot[1], tick * AMBIENT, 0.3 + 0.25 * hash2(tick, seed, 5));
      }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const item = live[i];
      if (item.pop) {
        if (t >= item.at) { live.splice(i, 1); rippleAt([item.pop[0], 0, item.pop[1]], 0.25, 'play'); }
      } else if (item.handle.done || t >= item.end) {
        item.handle.finish();
        live.splice(i, 1);
      }
    }
    if (bubbles.visible && t > bubblesUntil) bubbles.visible = false;
  }

  return {
    group, shape, surface, update, surfaceAt, depthAt, bubblesAt, wade,
    /** A ring spreading from a point on the water (a Vector3, [x, y, z] or { x, z }); strength 1 is a footstep's. */
    rippleAt: (point, strength = 1) => rippleAt(point, strength, 'play'),
    get level() { return shape.level; },
    get triangles() { return idx.length / 3; },
    dispose() {
      group.removeFromParent();
      geometry.dispose(); disposeMaterial();
      bubbleGeometry.dispose(); bubbleMaterial.dispose();
    },
  };
}

/**
 * The surface's material: teal in the deep, the bed through the shallows, the look's sky by a fresnel, the sun's sheen and glitter,
 * and RIPPLES rings in `uniforms.uRipples` ([x, z, the time it began, strength]; strength 0 is none), on the clock `uniforms.uTime`.
 * A geometry drawn with it carries aWater ([distance to the shore, negative inside, depth, 0]) and aFlow ([m/s, m/s]), and with
 * `prints` aState ([still and gold, glimmer], 0 to 1) and aLocal (the point in the print's frame): a footprint's water, its shore
 * the print's shape in `uniforms.uBlobs`, clear over its mud floor (`bed`). `fade` is the metres it fades out over inside its shore.
 */
export function createWaterMaterial(world, { seed = 12, fade = FADE, prints = false, bed = FEN.waterBed } = {}) {
  const noise = createNoiseTexture((seed ^ 0x77a7e) >>> 0);
  const sunDir = world.lighting?.direction?.clone?.() ?? new THREE.Vector3(0, 1, 0);
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(FEN.waterDeep) },
    uHorizon: { value: new THREE.Color(world.look?.sky?.horizon ?? FEN.waterSky) },
    uZenith: { value: new THREE.Color(world.look?.sky?.zenith ?? FEN.waterSky) },
    uTreeline: { value: new THREE.Color(FEN.waterTreeline) },
    uBed: { value: new THREE.Color(bed) },
    uGlint: { value: new THREE.Color(FEN.glint) },
    uSunDir: { value: sunDir },
    uNoise: { value: noise },
    uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uFade: { value: fade },
    ...(prints ? { uGold: { value: new THREE.Color(PRINT_GOLD) }, uBlobs: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, 1)) } } : {}),
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG, uniforms,
    fog: true, transparent: true, depthWrite: false,
  });
  material.name = prints ? 'fen-water prints' : 'fen-water';
  if (prints) material.defines = { PRINT_WATER: '' };
  return {
    material, uniforms,
    dispose() { material.dispose(); noise.dispose(); },
  };
}
export const RIPPLE_SLOTS = RIPPLES;
export const RIPPLE_LIFE = RIPPLE.life;
