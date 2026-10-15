// Ground: the height function, the ground masks (path, soil, forest floor, leaf litter) and the
// ground mesh with its material. The masks exist twice: as CPU functions (the planner and the
// grass use them) and baked into one small RGBA texture that the ground shader reads.
import * as THREE from 'three';
import { FOREST, PALETTE } from './config.js';
import { createNoise, smoothstep, clamp } from './random.js';
import { patchLambert, LIGHT_GLOBALS } from './materials.js';

/** Distance from a point to a polyline, with the arc-length position of the closest point. */
export function createPolyline(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, dx: bx - ax, dz: bz - az, len, s0: total });
    total += len;
  }
  function query(x, z) {
    let best = Infinity, bestS = 0, bestSeg = null;
    for (const s of segs) {
      const t = clamp(((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.len * s.len || 1), 0, 1);
      const px = s.ax + s.dx * t, pz = s.az + s.dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bestS = s.s0 + s.len * t; bestSeg = s; }
    }
    return { d: best, s: bestS, seg: bestSeg };
  }
  function pointAt(s) {
    for (const g of segs) {
      if (s <= g.s0 + g.len || g === segs[segs.length - 1]) {
        const t = clamp((s - g.s0) / g.len, 0, 1);
        return [g.ax + g.dx * t, g.az + g.dz * t, g.dx / g.len, g.dz / g.len];
      }
    }
    return [points[0][0], points[0][1], 1, 0];
  }
  return { query, pointAt, total, segs };
}

export function createTerrain(world, layout, seed) {
  const cfg = FOREST.terrain;
  const noise = createNoise(seed ^ 0x2c1b3c6d);
  const [cx, cz] = layout.clearing.center;
  const clearR = layout.clearing.radius;
  const edgeR = layout.forestEdge;
  const path = createPolyline(layout.path);
  const P = FOREST.path;

  function rawHeight(x, z) {
    const r = Math.hypot(x - cx, z - cz);
    let h = (noise.fbm(x * 0.032, z * 0.032, 3, 1) - 0.5) * 2 * cfg.undulation;
    h += (noise.fbm(x * 0.12 + 17, z * 0.12 - 9, 2, 2) - 0.5) * 2 * cfg.bumps;
    const calm = smoothstep(clearR * 0.55, clearR + 7, r);
    h *= cfg.clearingCalm + (1 - cfg.clearingCalm) * calm;
    // a gentle bowl: the forest floor rises away from the clearing
    h += smoothstep(clearR, cfg.bowlRadius, r) * cfg.bowlRise + Math.max(0, r - cfg.bowlRadius) * 0.012;
    // keep the path walkable: flatten hummocks along it
    const pd = path.query(x, z).d;
    const flat = smoothstep(3.5, 0.5, pd);
    h -= flat * (noise.fbm(x * 0.12 + 17, z * 0.12 - 9, 2, 2) - 0.5) * 2 * cfg.bumps * 0.8;
    return h;
  }
  const h0 = rawHeight(cx, cz);
  const heightAt = (x, z) => rawHeight(x, z) - h0;

  // ---- masks (CPU) ---------------------------------------------------------------------------
  function pathMask(x, z) {
    const q = path.query(x, z);
    const r = Math.hypot(x - cx, z - cz);
    const half = P.halfWidth + (P.halfWidthForest - P.halfWidth) * smoothstep(clearR, edgeR + 4, r);
    const wobble = (noise.noise(x * 0.9, z * 0.9, 21) - 0.5) * 0.35;
    const ends = smoothstep(0, P.fadeEnds, q.s) * smoothstep(path.total, path.total - P.fadeEnds, q.s);
    return (1 - smoothstep(half - P.edgeSoft, half + P.edgeSoft, q.d + wobble)) * ends;
  }
  function forestMask(x, z) {
    const r = Math.hypot(x - cx, z - cz);
    // a slow swell plus a ragged fringe, so the clearing's edge is never a drawn circle
    const wob = (noise.fbm(x * 0.09, z * 0.09, 2, 31) - 0.5) * 4.5 + (noise.fbm(x * 0.33, z * 0.33, 2, 37) - 0.5) * 2.6;
    return smoothstep(clearR + 0.5, edgeR + 1.5, r + wob);
  }

  // ---- canopy shade (CPU grid): where the crowns round the clearing throw their shadows ---------
  // The fake shade outside the shadow map used to be a function of the radius only, so the clearing's
  // shade edge was a smooth ring. setCanopy() stamps each crown's ground shadow (along the sun) into a
  // grid; shadeAt() is the forest mask raised by those stamps on the clearing's rim.
  let canopy = null;
  function setCanopy(crowns, sun) {
    const size = 2 * (edgeR + 9), res = 176, cell = size / res;
    const ox = cx - size / 2, oz = cz - size / 2;
    const data = new Float32Array(res * res);
    const sy = Math.max(0.2, sun.y);
    const hl = Math.hypot(sun.x, sun.z) || 1;
    const ux = -sun.x / hl, uz = -sun.z / hl; // shadows fall away from the sun
    for (const c of crowns) {
      const h = Math.max(0, c.y - heightAt(c.x, c.z));
      const reach = Math.min(h * hl / sy, h * 3); // how far the shadow lands from the crown
      const sx = c.x + ux * reach, sz = c.z + uz * reach;
      const across = c.r * 0.9, along = Math.min(c.r / sy, c.r * 2.5) * 0.9;
      const ext = along + 1;
      const i0 = Math.max(0, Math.floor((sx - ext - ox) / cell)), i1 = Math.min(res - 1, Math.ceil((sx + ext - ox) / cell));
      const j0 = Math.max(0, Math.floor((sz - ext - oz) / cell)), j1 = Math.min(res - 1, Math.ceil((sz + ext - oz) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = oz + (j + 0.5) * cell - sz;
        for (let i = i0; i <= i1; i++) {
          const x = ox + (i + 0.5) * cell - sx;
          const a = (x * ux + z * uz) / along, b = (-x * uz + z * ux) / across;
          const q = Math.sqrt(a * a + b * b);
          if (q >= 1) continue;
          const v = c.density * (1 - smoothstep(0.5, 1, q));
          const k = j * res + i;
          if (v > data[k]) data[k] = v;
        }
      }
    }
    canopy = { size, res, cell, ox, oz, data };
  }
  function canopyAt(x, z) {
    if (!canopy) return 0;
    const { res, cell, ox, oz, data } = canopy;
    const fx = (x - ox) / cell - 0.5, fz = (z - oz) / cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= res - 1 || j >= res - 1) return 0;
    const tx = fx - i, tz = fz - j, k = j * res + i;
    return (data[k] * (1 - tx) + data[k + 1] * tx) * (1 - tz) + (data[k + res] * (1 - tx) + data[k + res + 1] * tx) * tz;
  }
  /** Canopy shade, 0 open sky to 1 deep shade: the forest mask plus crown shadows on the rim. */
  function shadeAt(x, z) {
    const r = Math.hypot(x - cx, z - cz);
    const rim = smoothstep(clearR - 1.5, clearR + 1.5, r); // the clearing itself keeps the real shadows
    const fleck = 0.85 + 0.3 * noise.noise(x * 0.4, z * 0.4, 39);
    return Math.max(forestMask(x, z), clamp(canopyAt(x, z) * rim * fleck, 0, 1));
  }
  function soilMask(x, z) {
    const r = Math.hypot(x - cx, z - cz);
    const blobs = noise.fbm(x * 0.26 + 40, z * 0.26 - 12, 3, 41);
    let s = smoothstep(0.7, 0.82, blobs) * 0.55 * smoothstep(clearR + 3, clearR - 1, r) * smoothstep(2.5, 5, r);
    // worn soil along the path edges
    const pd = path.query(x, z).d;
    s = Math.max(s, smoothstep(1.7, 1.0, pd) * 0.55 * smoothstep(0.35, 0.65, noise.noise(x * 0.7, z * 0.7, 43)));
    // bare rim where the clearing meets the trees
    const rim = smoothstep(edgeR - 3, edgeR - 0.5, r) * smoothstep(edgeR + 4, edgeR + 1, r);
    s = Math.max(s, rim * 0.6 * smoothstep(0.45, 0.7, noise.noise(x * 0.35, z * 0.35, 47)));
    return clamp(s, 0, 1);
  }
  function litterMask(x, z) {
    const f = forestMask(x, z);
    return f * smoothstep(0.38, 0.62, noise.fbm(x * 0.21 - 7, z * 0.21 + 3, 2, 53));
  }
  /** Extra patches the planner can stamp (soil under the log, around rocks). */
  const stamps = [];
  function stampSoil(x, z, radius, strength = 0.8) { stamps.push({ x, z, radius, strength }); }
  function stampedSoil(x, z) {
    let s = 0;
    for (const p of stamps) s = Math.max(s, p.strength * smoothstep(p.radius, p.radius * 0.45, Math.hypot(x - p.x, z - p.z)));
    return s;
  }

  // ---- ground mesh ---------------------------------------------------------------------------
  function buildGroundGeometry(q) {
    const radii = [0];
    for (const [from, to, step] of cfg.rings) {
      if (step > 0) {
        const s = step / Math.max(0.6, q.trees);
        for (let r = from + s; r <= to + 1e-6; r += s) radii.push(r);
      } else {
        let r = from;
        while (r < to) { r = Math.min(to, r * 1.22); radii.push(r); }
      }
    }
    const segs = q.name === 'low' ? Math.round(cfg.segments * 0.75) : cfg.segments;
    const pos = [], nrm = [], idx = [];
    const e = 0.5;
    const pushVertex = (x, z) => {
      const y = heightAt(x, z);
      const nx = heightAt(x - e, z) - heightAt(x + e, z);
      const nz = heightAt(x, z - e) - heightAt(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      pos.push(x, y, z);
      nrm.push(nx / l, (2 * e) / l, nz / l);
    };
    pushVertex(cx, cz);
    for (let i = 1; i < radii.length; i++) {
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
        pushVertex(cx + Math.cos(a) * radii[i], cz + Math.sin(a) * radii[i]);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 1; i < radii.length - 1; i++) {
      const a0 = 1 + (i - 1) * segs, b0 = 1 + i * segs;
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        if (i % 2 === 1) {
          idx.push(a0 + j, a0 + j1, b0 + j);
          idx.push(a0 + j1, b0 + j1, b0 + j);
        } else {
          idx.push(a0 + j, b0 + j1, b0 + j);
          idx.push(a0 + j, a0 + j1, b0 + j1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  /** The canopy shade as a small single-channel texture for the ground shader. */
  function bakeShadeTexture() {
    const res = 256, size = cfg.maskSize;
    const data = new Uint8Array(res * res);
    const ox = cx - size / 2, oz = cz - size / 2;
    for (let j = 0; j < res; j++) {
      const z = oz + ((j + 0.5) / res) * size;
      for (let i = 0; i < res; i++) data[j * res + i] = Math.round(shadeAt(ox + ((i + 0.5) / res) * size, z) * 255);
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function bakeMaskTexture() {
    const res = cfg.maskRes, size = cfg.maskSize;
    const data = new Uint8Array(res * res * 4);
    const ox = cx - size / 2, oz = cz - size / 2;
    for (let j = 0; j < res; j++) {
      const z = oz + ((j + 0.5) / res) * size;
      for (let i = 0; i < res; i++) {
        const x = ox + ((i + 0.5) / res) * size;
        const k = (j * res + i) * 4;
        data[k] = Math.round(pathMask(x, z) * 255);
        data[k + 1] = Math.round(Math.max(soilMask(x, z), stampedSoil(x, z)) * 255);
        data[k + 2] = Math.round(forestMask(x, z) * 255);
        data[k + 3] = Math.round(litterMask(x, z) * 255);
      }
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return { tex, origin: new THREE.Vector2(ox, oz), size };
  }

  function createGroundMaterial(shared, actorUniforms) {
    const gain = cfg.albedoGain;
    const col = (hex, k = gain) => new THREE.Color(hex).multiplyScalar(k);
    const mask = bakeMaskTexture();
    const shadeTex = bakeShadeTexture();
    mask.shade = shadeTex;
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    material.name = 'forest-ground';
    const uniforms = {
      ...shared,
      ...actorUniforms,
      uGroundMask: { value: mask.tex },
      uShadeMask: { value: shadeTex },
      uMaskOrigin: { value: mask.origin },
      uMaskSize: { value: mask.size },
      uForestSun: { value: FOREST.shade.innerSun },
      uGrassBase: { value: col(PALETTE.grassBase, gain * 1.05) },
      uGrassSun: { value: col(PALETTE.grassSun, gain * 0.92) },
      uClover: { value: col(PALETTE.clover) },
      uForestA: { value: col('#4b5a33', 1.0) },
      uForestB: { value: col('#5d5a3a', 1.0) },
      uMoss: { value: col(PALETTE.moss, 0.95) },
      uSoil: { value: col(PALETTE.soil) },
      uSoilDark: { value: col(PALETTE.soilDark) },
      uPath: { value: col(PALETTE.path, gain * 0.98) },
      uPathEdge: { value: col(PALETTE.pathEdge) },
      uLitterA: { value: col(PALETTE.litterA, 0.95) },
      uLitterB: { value: col(PALETTE.litterB, 0.95) },
    };
    patchLambert(material, 'forest-ground', uniforms, {
      vertexHead: 'varying vec3 vGroundPos;',
      vertexAfter: [['#include <begin_vertex>', 'vGroundPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;']],
      fragmentHead: `
varying vec3 vGroundPos;
uniform sampler2D uNoise;
uniform sampler2D uGroundMask;
uniform sampler2D uShadeMask;
uniform vec2 uMaskOrigin;
uniform float uMaskSize;
uniform float uForestSun;
uniform float uDapple;
uniform float uWindTime;
uniform vec3 uGrassBase, uGrassSun, uClover, uForestA, uForestB, uMoss, uSoil, uSoilDark, uPath, uPathEdge, uLitterA, uLitterB;
${ACTOR_GLSL}
${LIGHT_GLOBALS}`,
      fragmentAfter: [['#include <color_fragment>', `
  vec2 gp = vGroundPos.xz;
  vec4 m = texture2D( uGroundMask, ( gp - uMaskOrigin ) / uMaskSize );
  vec4 nA = texture2D( uNoise, gp * 0.13 );
  vec4 nB = texture2D( uNoise, gp * 0.029 + 0.37 );
  vec4 nC = texture2D( uNoise, gp * 0.55 );
  float fine = nC.a, med = nA.g, coarse = nB.b;
  vec3 grass = mix( uGrassBase, uGrassSun, 0.3 + 0.45 * med ) * ( 0.84 + 0.3 * nA.a );
  grass = mix( grass, uClover, smoothstep( 0.6, 0.74, nB.g ) * 0.55 );
  vec3 floorC = mix( uForestA, uForestB, smoothstep( 0.25, 0.75, med ) ) * ( 0.9 + 0.2 * fine );
  floorC = mix( floorC, uMoss, smoothstep( 0.45, 0.75, coarse ) * 0.5 );
  vec3 col = mix( grass, floorC, smoothstep( 0.05, 0.95, m.b ) );
  float soil = smoothstep( 0.3, 0.62, m.g + ( fine - 0.5 ) * 0.4 );
  col = mix( col, mix( uSoil, uSoilDark, smoothstep( 0.3, 0.8, med ) * 0.7 ) * ( 0.9 + 0.2 * fine ), soil );
  float litter = m.a * smoothstep( 0.5, 0.68, nC.r );
  col = mix( col, mix( uLitterA, uLitterB, smoothstep( 0.3, 0.7, nA.r ) ) * 0.8, litter * 0.55 );
  float pathEdge = smoothstep( 0.22, 0.5, m.r + ( fine - 0.5 ) * 0.3 );
  float pathCore = smoothstep( 0.5, 0.85, m.r + ( med - 0.5 ) * 0.25 );
  vec3 pathC = mix( uPathEdge, uPath, pathCore ) * ( 0.9 + 0.18 * fine );
  pathC = mix( pathC, uPathEdge * 0.9, smoothstep( 0.62, 0.7, nC.g ) * 0.35 );
  col = mix( col, pathC, pathEdge );
  float ao = forestActorShade( vGroundPos );
  float nearActor = forestActorNear( vGroundPos ) * ( 1.0 - pathEdge );
  col = mix( col * mix( 0.88, 1.0, m.b ), col * vec3( 1.2, 1.14, 0.84 ) + vec3( 0.02, 0.016, 0.0 ), nearActor * 0.75 * uActorWarm * ( 1.0 - m.b ) );
  diffuseColor.rgb = col * ao;
  float shade = texture2D( uShadeMask, ( gp - uMaskOrigin ) / uMaskSize ).r;
  float openSky = mix( 1.0, uForestSun, smoothstep( 0.15, 0.9, shade ) );
  float dap = smoothstep( 0.6, 0.78, texture2D( uNoise, gp * 0.16 + vec2( uWindTime * 0.003, uWindTime * 0.002 ) ).r );
  gSun = openSky + ( 1.0 - openSky ) * dap * uDapple;
  gAmb = mix( 0.5, 1.0, openSky );
  // the real shadow map keeps counting well under the canopy edge, where the baked shade is
  // already dark, so no lit band opens between the two
  gShadowUse = smoothstep( 0.2, 0.45, openSky );`]],
    });
    return { material, mask };
  }

  return {
    heightAt, path, pathMask, forestMask, soilMask, litterMask, stampSoil, noise, setCanopy, shadeAt,
    buildGroundGeometry, createGroundMaterial,
  };
}

// Actor contact shade, shared by ground and grass: a soft darkening in a capsule around each
// actor's footprint, so every character keeps a contact shadow at every quality level.
export const ACTOR_GLSL = /* glsl */`
uniform vec4 uActors[4];
uniform vec4 uActorShape[4];
uniform int uActorCount;
uniform float uActorWarm;
float forestActorDistance( vec2 p, int i ) {
  vec4 a = uActors[ i ];
  vec4 s = uActorShape[ i ];
  vec2 d = p - a.xy;
  vec2 local = vec2( dot( d, a.zw ), dot( d, vec2( -a.w, a.z ) ) );
  vec2 q = vec2( max( abs( local.x ) - s.x, 0.0 ), local.y );
  return length( q ) - s.y;
}
float forestActorNear( vec3 wp ) {
  float near = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    if ( i >= uActorCount ) break;
    near = max( near, 1.0 - smoothstep( 1.2, 3.4, forestActorDistance( wp.xz, i ) ) );
  }
  return near;
}
float forestActorShade( vec3 wp ) {
  float shade = 1.0;
  for ( int i = 0; i < 4; i ++ ) {
    if ( i >= uActorCount ) break;
    float d = forestActorDistance( wp.xz, i );
    shade = min( shade, 1.0 - 0.4 * ( 1.0 - smoothstep( -0.5, 0.75, d ) ) );
  }
  return shade;
}`;
