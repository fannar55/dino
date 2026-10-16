// Grass: real blade geometry (no alpha test). Each blade is five vertices and three triangles;
// the vertex shader builds it from per-blade attributes, so the blade can bend in the wind, turn
// a little toward the camera, lie down under an actor's feet and shrink away with distance (each
// blade has a rank; far away only low ranks stay). The CPU rebuilds one index buffer from 2 m
// cells when the camera moves, so only visible blades at the right density reach the GPU.
import * as THREE from 'three';
import { FOREST, PALETTE, BEAT_SHARE } from './config.js';
import { createRng, smoothstep, clamp } from './random.js';
import { patchLambert, LIGHT_GLOBALS, LEAF_SHADOW_GLSL } from './materials.js';
import { ACTOR_GLSL } from './terrain.js';

const VERTS = 5;
const INDICES = [0, 1, 3, 0, 3, 2, 2, 3, 4];

export function createGrass(world, { terrain, layout, seed, shared, actorUniforms, blocked, q }) {
  const cfg = FOREST.grass;
  const rng = createRng(seed, 'grass');
  const noise = terrain.noise;
  const [cx, cz] = layout.clearing.center;
  const clearR = layout.clearing.radius;
  const edgeR = layout.forestEdge;
  const maxR = edgeR + cfg.extent;
  const low = q.name === 'low';
  const widthScale = low ? 1.35 : 1;
  const density = cfg.density * q.grass;
  const tuftSize = (cfg.clump[0] + cfg.clump[1]) / 2;

  /** Relative tuft density 0..1 at a point. */
  function densityAt(x, z) {
    const r = Math.hypot(x - cx, z - cz);
    let d;
    if (r < maxR) {
      d = 1 - (1 - cfg.forestDensity) * smoothstep(clearR + 0.5, maxR, r + (noise.noise(x * 0.3, z * 0.3, 61) - 0.5) * 2.5);
    } else {
      d = cfg.forestDensity * smoothstep(0.45, 0.65, noise.noise(x * 0.25, z * 0.25, 63)) * smoothstep(edgeR + 10, edgeR + 6, r);
    }
    const pq = terrain.path.query(x, z);
    if (r > maxR - 2 && r < cfg.corridorReach) d = Math.max(d, 0.32 * smoothstep(3.2, 1.2, pq.d) * smoothstep(cfg.corridorReach, cfg.corridorReach - 6, r));
    const pm = terrain.pathMask(x, z);
    d *= 1 - (1 - cfg.pathDensity) * smoothstep(0.15, 0.7, pm);
    d *= 1 - 0.7 * smoothstep(0.15, 0.65, terrain.soilMask(x, z));
    return clamp(d, 0, 1);
  }

  const blades = [];
  function addTuft(x, z, r) {
    const n = rng.int(cfg.clump[0], cfg.clump[1]);
    const pm = terrain.pathMask(x, z);
    const forest = terrain.forestMask(x, z);
    const tall = 0.85 + 0.35 * smoothstep(clearR - 4, clearR + 1, r) + 0.25 * (noise.noise(x * 0.18, z * 0.18, 71) - 0.5);
    const dryPatch = smoothstep(0.32, 0.6, noise.fbm(x * 0.11 + 5, z * 0.11 - 3, 2, 73));
    const sun = 1 - (1 - FOREST.shade.edgeSun) * terrain.shadeAt(x, z);
    for (let k = 0; k < n; k++) {
      const a = rng.angle();
      const rr = Math.sqrt(rng.next()) * cfg.clumpRadius;
      const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
      if (blocked(bx, bz)) continue;
      const tallBlade = rng.chance(0.38);
      let h = (tallBlade ? cfg.height[1] * rng.range(0.7, 1.05) : cfg.height[0] * rng.range(0.7, 1.35)) * tall;
      h *= 1 - 0.55 * smoothstep(0.2, 0.8, pm) - 0.35 * forest;
      blades.push({
        x: bx, y: terrain.heightAt(bx, bz) - 0.02, z: bz,
        yaw: a + rng.range(-0.6, 0.6),
        h: Math.max(0.06, h),
        w: (cfg.width[0] + (cfg.width[1] - cfg.width[0]) * rng.next()) * widthScale,
        rand: rng.next(),
        dry: clamp(dryPatch * 0.75 + rng.next() * 0.35, 0, 1),
        sun,
        lean: rng.next(),
        lx: Math.cos(a), lz: Math.sin(a),
      });
    }
  }

  // dense clearing grass on a jittered grid of tufts
  const tuftDensity = density / tuftSize;
  const cell = 1 / Math.sqrt(tuftDensity);
  const reach = cfg.corridorReach;
  for (let gz = -reach; gz < reach; gz += cell) {
    for (let gx = -reach; gx < reach; gx += cell) {
      const x = cx + gx + (rng.next() - 0.5) * cell;
      const z = cz + gz + (rng.next() - 0.5) * cell;
      const r = Math.hypot(x - cx, z - cz);
      if (r > reach) { rng.next(); continue; }
      const d = densityAt(x, z);
      if (rng.next() >= d) continue;
      addTuft(x, z, r);
    }
  }

  const gain = FOREST.terrain.albedoGain;
  const col = (hex, k = gain) => new THREE.Color(hex).multiplyScalar(k);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  material.name = 'forest-grass';
  const lod = new THREE.Vector4(cfg.lodNear, cfg.lodFar, cfg.lodMin, cfg.cameraClear);
  const uniforms = {
    ...shared,
    ...actorUniforms,
    uGrassLod: { value: lod },
    uGrassLean: { value: cfg.lean },
    uFootprintSoft: { value: cfg.footprint.soft },
    uGrassBase: { value: col(PALETTE.grassBase, 1.05) },
    uGrassMid: { value: new THREE.Color(PALETTE.grassSun).lerp(new THREE.Color(PALETTE.clover), 0.2).multiplyScalar(1.12) },
    uGrassTip: { value: col(PALETTE.grassTip, 1.08) },
    uGrassShade: { value: col(PALETTE.grassShade, 1.0) },
  };
  patchLambert(material, 'forest-grass', uniforms, {
    vertexHead: `
attribute vec4 aBlade;
attribute vec4 aInfo;
uniform float uWindTime;
uniform float uWindStrength;
uniform vec2 uWindDirection;
uniform float uBeat;
uniform vec4 uGrassLod;
uniform float uGrassLean;
uniform float uFootprintSoft;
varying float vT;
varying vec3 vInfo;
varying vec3 vGrassBase;
${ACTOR_GLSL}`,
    vertexAfter: [
      ['#include <batching_vertex>', `
  int gVid = gl_VertexID % 5;
  float gSide = ( gVid == 0 || gVid == 2 ) ? -1.0 : ( gVid == 4 ? 0.0 : 1.0 );
  float gT = gVid < 2 ? 0.0 : ( gVid < 4 ? 0.5 : 1.0 );
  float gWidthK = gVid < 2 ? 1.0 : ( gVid < 4 ? 0.7 : 0.0 );
  vec3 gBase = position;
  float gH = aBlade.y;
  float gW = aBlade.z;
  vec3 gToCam = cameraPosition - gBase;
  float gDist = length( gToCam );
  float gDens = mix( 1.0, uGrassLod.z, smoothstep( uGrassLod.x, uGrassLod.y, gDist ) );
  float gKeep = 1.0 - smoothstep( gDens - 0.06, gDens, aBlade.w );
  gH *= gKeep * smoothstep( uGrassLod.w * 0.3, uGrassLod.w, gDist );
  gW *= mix( 1.0, 1.0 / sqrt( max( gDens, 0.2 ) ), 0.6 );
  // actors flatten and part the grass
  float gFlat = 1.0;
  vec2 gPush = vec2( 0.0 );
  for ( int i = 0; i < 4; i ++ ) {
    if ( i >= uActorCount ) break;
    float d = forestActorDistance( gBase.xz, i );
    float f = smoothstep( -0.2, uFootprintSoft, d );
    gFlat = min( gFlat, mix( 0.1, 1.0, f ) );
    vec2 away = gBase.xz - uActors[ i ].xy;
    gPush += normalize( away + 1e-4 ) * ( 1.0 - f ) * 0.9;
  }
  gH *= gFlat;
  // facing: a random yaw turned part-way toward the camera
  vec2 gFace = normalize( mix( vec2( sin( aBlade.x ), cos( aBlade.x ) ), normalize( gToCam.xz + 1e-4 ), 0.45 ) );
  vec2 gAcross = vec2( gFace.y, -gFace.x );
  // lean, wind waves and gusts
  vec2 gLeanDir = vec2( sin( aInfo.x * 37.7 ), cos( aInfo.x * 37.7 ) );
  float gAlong = dot( gBase.xz, uWindDirection );
  float gWave = 0.5 + 0.5 * sin( gAlong * 0.55 - uWindTime * 1.9 + sin( dot( gBase.xz, vec2( 0.21, -0.17 ) ) ) * 1.3 );
  float gGust = 0.5 + 0.5 * sin( gAlong * 0.12 - uWindTime * 0.62 + 1.7 );
  float gFlick = sin( uWindTime * 3.3 + aInfo.x * 41.0 ) * 0.1;
  float gWind = uWindStrength * ( 0.12 + 0.5 * gWave * ( 0.35 + 0.65 * gGust ) + gFlick );
  gWind *= 1.0 + ${BEAT_SHARE.toFixed(3)} * uBeat; // on the beat a blade bends further by the same share of its own bend as a tree top
  vec2 gBend = gLeanDir * ( aInfo.w * uGrassLean ) + uWindDirection * gWind + gPush;
  float gTT = gT * gT;
  vec3 grassPos = gBase;
  grassPos.y += gH * gT * ( 1.0 - 0.3 * min( dot( gBend, gBend ), 1.5 ) * gTT );
  grassPos.xz += gBend * gH * gTT;
  grassPos.xz += gAcross * gSide * gW * 0.5 * gWidthK;
  vec3 grassNormal = normalize( mix( vec3( gFace.x, 0.0, gFace.y ), vec3( 0.0, 1.0, 0.0 ), 0.62 ) );
  vT = gT;
  vInfo = aInfo.xyz;
  vGrassBase = gBase;`],
      ['#include <beginnormal_vertex>', '  objectNormal = grassNormal;'],
      ['#include <begin_vertex>', '  transformed = grassPos;'],
    ],
    fragmentHead: `
uniform sampler2D uNoise;
uniform float uDapple;
uniform float uWindTime;
uniform vec3 uGrassBase, uGrassMid, uGrassTip, uGrassShade;
varying float vT;
varying vec3 vInfo;
varying vec3 vGrassBase;
${ACTOR_GLSL}
${LIGHT_GLOBALS}
${LEAF_SHADOW_GLSL}`,
    fragmentAfter: [
      ['#include <color_fragment>', `
  vec3 gc = mix( uGrassBase, uGrassMid, smoothstep( 0.0, 0.45, vT ) );
  vec3 gTip = mix( uGrassMid, uGrassTip, 0.45 + 0.55 * vInfo.y );
  gc = mix( gc, gTip, smoothstep( 0.42, 0.95, vT ) * ( 0.7 + 0.3 * vInfo.y ) );
  gc *= mix( vec3( 1.0 ), vec3( 1.06, 1.0, 0.78 ), vInfo.y * 0.4 );
  gc *= 0.82 + 0.3 * vInfo.x;
  gc *= mix( 0.7, 1.0, smoothstep( 0.0, 0.45, vT ) );
  // near a character the grass is lighter and more golden (STYLE.md 5.1)
  float gNear = forestActorNear( vGrassBase );
  gc = mix( gc, gc * vec3( 1.16, 1.1, 0.8 ) + vec3( 0.02, 0.016, 0.0 ), gNear * 0.7 * uActorWarm );
  gc = mix( uGrassShade, gc, 0.35 + 0.65 * vInfo.z );
  diffuseColor.rgb = gc * forestActorShade( vGrassBase );
  float gDap = smoothstep( 0.6, 0.78, texture2D( uNoise, vGrassBase.xz * 0.16 + vec2( uWindTime * 0.003, uWindTime * 0.002 ) ).r );
  gSun = vInfo.z + ( 1.0 - vInfo.z ) * gDap * uDapple;
  if ( uLeafShadow > 0.0 ) gSun *= 1.0 - uLeafShadow * forestLeafShadow( vGrassBase.xz ) * ( 1.0 - gNear ); // as on the ground
  gAmb = mix( 0.65, 1.0, vInfo.z );
  gShadowUse = smoothstep( 0.52, 0.64, vInfo.z ); // as on the ground: real shadows reach under the edge
  gLeaf = 0.42 * vT;`],
      ['#include <normal_fragment_begin>', '  normal = normalize( vNormal );'],
    ],
  });

  // Blades are sorted into 2 m cells; inside a cell they are shuffled, so any prefix of a cell is
  // an even sample (the blade's rank). One mesh holds them all. Its index buffer is rebuilt when
  // the camera moves: each visible cell contributes the prefix its distance needs, so the GPU only
  // receives blades that can be seen, at the density their distance calls for, in one draw call.
  const CELL = 2;
  const cellMap = new Map();
  for (const b of blades) {
    const i = Math.floor((b.x - cx) / CELL), j = Math.floor((b.z - cz) / CELL);
    const key = `${i},${j}`;
    if (!cellMap.has(key)) cellMap.set(key, { i, j, list: [] });
    cellMap.get(key).list.push(b);
  }
  const cells = [...cellMap.values()].sort((a, b) => (a.j - b.j) || (a.i - b.i));
  const n = blades.length;
  const pos = new Float32Array(n * VERTS * 3);
  const blade = new Float32Array(n * VERTS * 4);
  const info = new Uint8Array(n * VERTS * 4);
  const master = new Uint32Array(n * 9);
  const cellData = [];
  let at = 0;
  const bounds = new THREE.Box3();
  for (const c of cells) {
    const list = c.list;
    for (let k = list.length - 1; k > 0; k--) {
      const j = Math.floor(rng.next() * (k + 1));
      [list[k], list[j]] = [list[j], list[k]];
    }
    const box = new THREE.Box3();
    const start = at;
    list.forEach((b, idx) => {
      const rank = (idx + 0.5) / list.length;
      for (let k = 0; k < VERTS; k++) {
        const v = at * VERTS + k;
        pos[v * 3] = b.x; pos[v * 3 + 1] = b.y; pos[v * 3 + 2] = b.z;
        blade[v * 4] = b.yaw; blade[v * 4 + 1] = b.h; blade[v * 4 + 2] = b.w; blade[v * 4 + 3] = rank;
        info[v * 4] = Math.round(b.rand * 255);
        info[v * 4 + 1] = Math.round(b.dry * 255);
        info[v * 4 + 2] = Math.round(b.sun * 255);
        info[v * 4 + 3] = Math.round(b.lean * 255);
      }
      for (let k = 0; k < 9; k++) master[at * 9 + k] = at * VERTS + INDICES[k];
      box.expandByPoint(new THREE.Vector3(b.x, b.y, b.z));
      at++;
    });
    box.min.y -= 0.1;
    box.max.y += 0.6;
    bounds.union(box);
    cellData.push({ start, count: list.length, box });
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.BufferAttribute(blade, 4));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4, true));
  const dynamic = new THREE.BufferAttribute(new Uint32Array(n * 9), 1);
  dynamic.setUsage(THREE.DynamicDrawUsage);
  g.setIndex(dynamic);
  g.setDrawRange(0, 0);
  bounds.expandByScalar(0.5);
  g.boundingBox = bounds;
  g.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'Grass';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  const group = new THREE.Group();
  group.name = 'Grass';
  group.add(mesh);

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const lastPos = new THREE.Vector3(Infinity, 0, 0);
  const lastDir = new THREE.Vector3();
  let lastFov = 0;
  const frustum = new THREE.Frustum();
  const m4 = new THREE.Matrix4();
  const grown = new THREE.Box3();
  const MARGIN = 1.6; // metres the camera may move before the next rebuild without blades popping
  let submitted = 0;

  function rebuild(camera) {
    m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m4);
    const out = dynamic.array;
    let offset = 0;
    for (const c of cellData) {
      const d = c.box.distanceToPoint(camPos);
      if (d > cfg.lodFar + 30) continue;
      if (d > 3) {
        grown.copy(c.box).expandByScalar(2.5);
        if (!frustum.intersectsBox(grown)) continue;
      }
      const dens = 1 + (cfg.lodMin - 1) * smoothstep(cfg.lodNear, cfg.lodFar, Math.max(0, d - MARGIN));
      const k = Math.min(c.count, Math.ceil(dens * c.count + 0.5));
      out.set(master.subarray(c.start * 9, (c.start + k) * 9), offset);
      offset += k * 9;
    }
    g.setDrawRange(0, offset);
    dynamic.clearUpdateRanges();
    dynamic.addUpdateRange(0, Math.max(offset, 9));
    dynamic.needsUpdate = true;
    submitted = offset / 3;
  }

  function update(camera) {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    camDir.set(0, 0, -1).transformDirection(camera.matrixWorld);
    if (camPos.distanceTo(lastPos) > 0.6 || camDir.dot(lastDir) < 0.9986 || camera.fov !== lastFov) {
      rebuild(camera);
      lastPos.copy(camPos);
      lastDir.copy(camDir);
      lastFov = camera.fov;
    }
  }

  return {
    group, meshes: [mesh], material, update, blades: n, triangles: n * 3,
    get submitted() { return submitted; },
    dispose() { g.dispose(); material.dispose(); },
  };
}
