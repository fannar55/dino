// The mountain's real look (chapter 6, chunk 2), shared by its three stages: the game's own ground material and plants on a small
// stage, and the cloud's cards lit by the scene's own lights.
//
//   createStageLook(world, { seed })  -> { noise, leaf, ground, plants: { solid, thin }, dispose() }
//                                    the valley's ground material (world/ardalur/look.js createGroundMaterial: vertex colours and
//                                    the noise's patches) and the forest's plant materials (createPlantMaterials), made once a stage
//   plantMeshes(placements, { library, materials }) -> { meshes, triangles, dispose() }
//                                    the game's own plants and rocks (world/forest/species.js), each at its place, merged into two
//                                    static meshes (their solid and their thin parts) as the forest's batcher bakes them: they sway in
//                                    the wind, take the sun's shadow and the fog as the forest's do; one draw call each
//   createCloudCards(world, cards, { name, renderOrder, fogShare }) -> { mesh, cards, setOpacity(v), setGlow(v), update(), dispose() }
//                                    soft cloud cards in one mesh: upright ones turned to the camera about the vertical (a bank, a
//                                    wisp) and flat ones lying level (the sea of cloud, a cloud's underside), white and lit by the
//                                    scene's own sun and sky each frame (update), the light through them toward the sun; nothing of
//                                    the light is in their colour, so any look (engine/light-blend.js lightTo) lights them, night too
import * as THREE from 'three';
import { createGroundMaterial, createPlantMaterials } from '../ardalur/look.js';
import { createNoiseTexture, createLeafTexture } from '../forest/materials.js';
import { FOREST } from '../forest/config.js';
import { createWind } from '../../engine/wind.js';

const SWAY = FOREST.wind.swayScale;

/** The ground and plant materials of a stage. A world with no wind (a test's) gets one of its own. */
export function createStageLook(world, { seed = 6 } = {}) {
  const noise = createNoiseTexture((seed * 7919) >>> 0);
  const leaf = createLeafTexture((seed * 104729) >>> 0);
  const ground = createGroundMaterial(noise);
  const plantWorld = world.wind ? world : Object.assign(Object.create(world), { wind: createWind() });
  const plants = createPlantMaterials(plantWorld, { noise, leaf });
  return {
    noise, leaf, ground, plants,
    dispose() { ground.dispose(); plants.dispose(); noise.dispose(); leaf.dispose(); },
  };
}

/**
 * The game's own plants and rocks at `placements` ([{ name, variant, lod, x, y, z, rot, scale, sky, phase }]: a species of
 * world/forest/species.js, rot in radians, y its foot), merged into one mesh of their solid parts and one of their thin (fronds,
 * petals), with the forest's vertex data (aWind, aTree, aPivot: batch.js), drawn with `materials` (createPlantMaterials's).
 */
export function plantMeshes(placements, { library, materials, name = 'Plants' }) {
  const parts = { solid: [], thin: [] };
  for (const p of placements) {
    const model = library.get(p.name, p.variant ?? 0, p.lod ?? 0);
    for (const kind of ['solid', 'thin']) if (model[kind]?.count) parts[kind].push({ m: model[kind], p });
  }
  const meshes = [];
  let triangles = 0;
  for (const kind of ['solid', 'thin']) {
    const items = parts[kind];
    if (!items.length) continue;
    const n = items.reduce((sum, { m }) => sum + m.count, 0);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Uint8Array(n * 4);
    const wind = new Uint8Array(n * 4), tree = new Uint8Array(n), pivot = new Uint8Array(n * 4);
    const index = [];
    let v = 0;
    for (const { m, p } of items) {
      const c = Math.cos(p.rot ?? 0), s = Math.sin(p.rot ?? 0), sc = p.scale ?? 1, sky = p.sky ?? 0.9;
      const phase = Math.round(((p.phase ?? 0.5) % 1) * 255);
      const base = v;
      for (let i = 0; i < m.count; i++, v++) {
        const lx = m.pos[i * 3], ly = m.pos[i * 3 + 1], lz = m.pos[i * 3 + 2];
        const nx = m.nrm[i * 3], ny = m.nrm[i * 3 + 1], nz = m.nrm[i * 3 + 2];
        pos[v * 3] = p.x + (lx * c - lz * s) * sc; pos[v * 3 + 1] = p.y + ly * sc; pos[v * 3 + 2] = p.z + (lx * s + lz * c) * sc;
        nrm[v * 3] = nx * c - nz * s; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nx * s + nz * c;
        for (let k = 0; k < 3; k++) col[v * 4 + k] = Math.round(Math.min(1, m.col[i * 3 + k]) * 255);
        col[v * 4 + 3] = Math.round(Math.min(1, Math.max(0, sky + (1 - sky) * m.exp[i])) * 255);
        wind[v * 4] = phase;
        wind[v * 4 + 1] = Math.round(Math.min(1, (m.wind[i * 3] * sc) / SWAY) * 255);
        wind[v * 4 + 2] = Math.round(Math.min(1, m.wind[i * 3 + 1]) * 255);
        wind[v * 4 + 3] = Math.round(Math.min(1, m.wind[i * 3 + 2]) * 255);
        tree[v] = Math.round(m.treeShare(m.wind[i * 3]) * 255);
      }
      for (const i of m.idx) index.push(base + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    g.setAttribute('aWind', new THREE.BufferAttribute(wind, 4, true));
    g.setAttribute('aTree', new THREE.BufferAttribute(tree, 1, true));
    g.setAttribute('aPivot', new THREE.BufferAttribute(pivot, 4, true)); // nothing moves about a pivot of its own here
    g.setIndex(index);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1; // the sway
    const mesh = new THREE.Mesh(g, kind === 'solid' ? materials.solid : materials.thin);
    mesh.name = `${name} (${kind})`;
    mesh.castShadow = kind === 'solid';
    mesh.receiveShadow = true;
    meshes.push(mesh);
    triangles += index.length / 3;
  }
  return { meshes, triangles, dispose() { for (const mesh of meshes) mesh.geometry.dispose(); } };
}

// ---- the cloud's cards ----------------------------------------------------------------------------------------------

const CARD_VERT = /* glsl */`
attribute vec3 aCentre;
attribute vec2 aCorner;
attribute vec4 aCard; // x: width (m), y: height (m), z: opacity, w: seed
attribute vec2 aKind; // x: 1 flat (lying level), 0 upright (turned to the camera about the vertical); y: a flat card's turn (radians)
uniform float uOpacity;
varying vec2 vUv;
varying float vOpacity;
varying float vSeed;
varying float vFlat;
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 w;
  if ( aKind.x > 0.5 ) {
    float c = cos( aKind.y ), s = sin( aKind.y );
    vec2 p = aCorner * aCard.xy * 0.5;
    w = aCentre + vec3( p.x * c - p.y * s, 0.0, p.x * s + p.y * c );
  } else {
    vec2 to = cameraPosition.xz - aCentre.xz;
    vec2 across = normalize( vec2( to.y, -to.x ) + 1e-5 );
    w = aCentre + vec3( across.x, 0.0, across.y ) * aCorner.x * aCard.x * 0.5 + vec3( 0.0, aCorner.y * aCard.y * 0.5, 0.0 );
  }
  vWorld = w;
  vUv = aCorner;
  vOpacity = aCard.z * uOpacity;
  vSeed = aCard.w;
  vFlat = aKind.x;
  vec4 mvPosition = viewMatrix * vec4( w, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CARD_FRAG = /* glsl */`
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform float uTime;
uniform float uFogShare;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vOpacity;
varying float vSeed;
varying float vFlat;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 q = vUv * 0.5 + 0.5;
  vec2 drift = vec2( uTime * 0.006, uTime * 0.002 );
  float n = texture2D( uNoise, q * 0.6 + vSeed * 0.37 + drift ).g * 0.6 + texture2D( uNoise, q * 1.7 + vSeed * 0.71 - drift ).b * 0.4;
  // its outline: a round puff lying level; standing, a heap with a fuller foot
  vec2 shape = vFlat > 0.5 ? vUv : vec2( vUv.x, vUv.y > 0.0 ? vUv.y : vUv.y * 0.55 );
  float puff = texture2D( uNoise, q * 0.9 + vSeed * 1.13 ).r; // round heaps along its edge
  float r = length( shape ) + ( n - 0.5 ) * 0.7 + ( puff - 0.5 ) * 0.35;
  float a = vOpacity * ( 1.0 - smoothstep( 0.45, 0.95, r ) );
  if ( vFlat < 0.5 ) a *= smoothstep( -1.0, -0.7, vUv.y ); // no hard foot
  if ( a < 0.003 ) discard;
  float thick = 1.0 - smoothstep( 0.0, 1.0, r ); // thin at its edges, thick in its middle
  // a soft normal: up for a lying card (tilted by the noise), up and toward the camera for a standing one
  vec3 view = normalize( vWorld - cameraPosition );
  vec3 normal = vFlat > 0.5
    ? normalize( vec3( ( n - 0.5 ) * 0.8, 1.0, ( texture2D( uNoise, q * 0.9 + vSeed ).r - 0.5 ) * 0.8 ) )
    : normalize( vec3( -view.x, 0.0, -view.z ) * 0.7 + vec3( 0.0, 0.25 + 0.75 * clamp( vUv.y * 0.5 + 0.5, 0.0, 1.0 ), 0.0 ) );
  if ( vFlat > 0.5 && cameraPosition.y < vWorld.y ) normal.y = -normal.y; // its underside, seen from below
  float up = normal.y * 0.5 + 0.5;
  // a heap is lit on its top and its sunward side, in its own shade low down and in the folds between its puffs
  float height = vFlat > 0.5 ? 0.75 : clamp( vUv.y * 0.5 + 0.5, 0.0, 1.0 );
  float fold = mix( 0.7, 1.0, smoothstep( 0.2, 0.8, puff ) );
  float lit = clamp( dot( normal, uSunDir ) * 0.55 + 0.45, 0.0, 1.0 ) * mix( 0.45, 1.0, height ) * fold; // wrapped: light goes round a cloud
  float through = pow( max( dot( view, uSunDir ), 0.0 ), 6.0 ) * ( 0.35 + 0.65 * ( 1.0 - thick ) ); // the light through it toward the sun
  vec3 albedo = vec3( 0.9 + 0.1 * n );
  vec3 colour = albedo * RECIPROCAL_PI * ( mix( uGround, uSky, up ) * mix( 0.8, 1.2, height ) + uSun * ( lit * 1.25 + through * 1.6 ) ) + uGlow * ( 0.5 + 0.5 * thick );
  gl_FragColor = vec4( colour, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 unfogged = gl_FragColor.rgb;
  #include <fog_fragment>
  gl_FragColor.rgb = mix( unfogged, gl_FragColor.rgb, uFogShare );
}`;

/**
 * Cloud cards ([{ x, y, z, w, h, opacity, seed, flat, turn }]: centre, width and height in metres, `flat` lying level and turned
 * `turn` radians, else standing) in one mesh. `fogShare`: how much of the fog they take (1 all of it).
 */
export function createCloudCards(world, cards, { name = 'Cloud cards', renderOrder = 12, fogShare = 1, seed = 6, noise = null } = {}) {
  const count = cards.length;
  const centres = new Float32Array(count * 12), data = new Float32Array(count * 16), kinds = new Float32Array(count * 8);
  const corners = [], index = [];
  cards.forEach((c, k) => {
    for (let v = 0; v < 4; v++) {
      const i = k * 4 + v;
      centres.set([c.x, c.y, c.z], i * 3);
      data.set([c.w, c.h, c.opacity ?? 1, c.seed ?? k * 1.37], i * 4);
      kinds.set([c.flat ? 1 : 0, c.turn ?? 0], i * 2);
    }
    corners.push(-1, -1, 1, -1, 1, 1, -1, 1);
    index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geometry = new THREE.BufferGeometry();
  const centreAttr = new THREE.BufferAttribute(centres, 3);
  geometry.setAttribute('position', centreAttr); // three needs one; the shader places the corners
  geometry.setAttribute('aCentre', centreAttr);
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
  const cardAttr = new THREE.BufferAttribute(data, 4);
  geometry.setAttribute('aCard', cardAttr);
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 2));
  geometry.setIndex(index);
  // its bounds: every card's centre and reach (the corners are placed in the shader)
  const box = new THREE.Box3();
  for (const c of cards) {
    const reach = Math.max(c.w, c.h) / 2;
    box.expandByPoint(new THREE.Vector3(c.x - reach, c.y - reach, c.z - reach));
    box.expandByPoint(new THREE.Vector3(c.x + reach, c.y + reach, c.z + reach));
  }
  geometry.boundingBox = box;
  geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const ownNoise = noise ? null : createNoiseTexture((seed ^ 0x2c1b) >>> 0);
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uSun: { value: new THREE.Color(1, 1, 1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSky: { value: new THREE.Color(1, 1, 1) },
    uGround: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uOpacity: { value: 1 },
    uTime: { value: 0 },
    uFogShare: { value: fogShare },
    uNoise: { value: noise ?? ownNoise },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: CARD_VERT, fragmentShader: CARD_FRAG, uniforms, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  material.name = `fjall-${name.toLowerCase().replace(/\W+/g, '-')}`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = renderOrder;
  const glow = new THREE.Color();
  /** The scene's own light into the cards: the sun's colour and strength and its way, the sky's fill above and below. */
  function update(dt = 0, time = uniforms.uTime.value + dt) {
    uniforms.uTime.value = time;
    const { sun, hemi, direction } = world.lighting ?? {};
    if (sun) uniforms.uSun.value.copy(sun.color).multiplyScalar(sun.intensity);
    if (direction) uniforms.uSunDir.value.copy(direction).normalize();
    if (hemi) {
      uniforms.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity);
      uniforms.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
    }
  }
  update(0, 0);
  return {
    mesh, cards, uniforms, update,
    /** All of them fainter (0) or as made (1). */
    setOpacity(v) { uniforms.uOpacity.value = Math.max(0, v); mesh.visible = v > 0.002; },
    /** A light of their own (the festival's glow under the night: 0 none, 1 a warm glow), in linear colour. */
    setGlow(v, colour = '#ffb46b') { uniforms.uGlow.value.copy(glow.set(colour)).multiplyScalar(Math.max(0, v) * 0.6); },
    /** One card's opacity (k its index), as made times `v`. */
    cardOpacity(k, v) {
      for (let i = 0; i < 4; i++) data[(k * 4 + i) * 4 + 2] = (cards[k].opacity ?? 1) * v;
      cardAttr.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); ownNoise?.dispose(); mesh.removeFromParent(); },
  };
}
