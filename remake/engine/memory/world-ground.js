import * as THREE from 'three';
import { RIVER, MARSH, BRIDGE, riverDistance } from './bridge-props.js';
import { marshValley } from './build-props.js';

const clamp = THREE.MathUtils.clamp, smoothstep = THREE.MathUtils.smoothstep;

// The ground of the memory game. CORRIDORS are where the camera works: no tall crown may stand there (world.js keepOut).
// Rectangles are [minX, maxX, minZ, maxZ].
export const CORRIDORS = Object.freeze([[-12, 21, -18, 16], [-5, 15, -34, -16]]);
// The sandy places and the trails joining them: the glade, the staging place after the log, the grove, and the trail between.
const PLACES = Object.freeze([{ centre: [-4.2, 6.8], radius: [9.4, 7.8] }, { centre: [4.5, -13.6], radius: [6.2, 3.6] }, { centre: [4.5, -26], radius: [5.8, 3.8] }]);
const TRAILS = Object.freeze([
  { points: [[-20, 11], [-8, 8], [-6, 4], [-3.4, .4], [-1, -3]], halfWidth: 1.3 },
  { points: [[4, -9], [4.5, -12], [4.5, -17.25]], halfWidth: 1.45 },
  { points: [[4.5, -21.75], [4.5, -24], [4.5, -28]], halfWidth: 1.45 },
]);
// Where the ground mask is baked: this many texels to the metre over this box.
const BOX = Object.freeze({ x: -36, z: -52, width: 84, depth: 92, texels: 4 });

function trailDistance(x, z, points) {
  let result = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    result = Math.min(result, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return result;
}

/** 1 on the open ground the camera works over (the glade and the long strip to the grove), easing to 0 over some metres of its edge. */
export function openAt(x, z) {
  const glade = Math.hypot((x + 4) / 14.5, (z - 5.5) / 12.5), strip = trailDistance(x, z, [[4.5, -9], [4.5, -28]]) / 9.5;
  return 1 - smoothstep(Math.min(glade, strip), .72, 1.28);
}
/** 1 on a sandy place or trail, 0 off it, with its edge a metre wide (the shader roughens it). Never on the water. */
export function sandAt(x, z) {
  let sand = 0;
  for (const { centre, radius } of PLACES) sand = Math.max(sand, 1 - smoothstep(Math.hypot((x - centre[0]) / radius[0], (z - centre[1]) / radius[1]), .82, 1.14));
  for (const { points, halfWidth } of TRAILS) sand = Math.max(sand, 1 - smoothstep(trailDistance(x, z, points), halfWidth - .5, halfWidth + .55));
  const dry = smoothstep(riverDistance(x, z).distance, RIVER.halfWidth + .1, RIVER.halfWidth + .75);
  const marsh = Math.hypot((x - MARSH.center[0]) / MARSH.halfWidth, (z - MARSH.center[1]) / MARSH.halfDepth);
  return sand * dry * smoothstep(marsh, 1.5, 1.95);
}
// Where the friends and Mosi walk and stand: the three play places, the way over the log, the water and the boardwalk's lane.
const WALK = Object.freeze([[-9.4, 5.9, -5.7, 10.3], [-1.9, 10.6, -17.4, -9.8], [-1.3, 10.4, -30.3, -22.1]]);
/** True where a plant would stand in somebody's way, or closer than `margin` metres to it (the living forest and the dressing keep out). */
export function walkable(x, z, margin = 0) {
  if (WALK.some(([x0, x1, z0, z1]) => x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin)) return true;
  if (Math.min(Math.hypot(x - BRIDGE.near[0], z - BRIDGE.near[1]), Math.hypot(x - BRIDGE.far[0], z - BRIDGE.far[1])) < 3.3 + margin) return true;
  if (trailDistance(x, z, [BRIDGE.near, BRIDGE.far]) < 2.2 + margin) return true;
  if (riverDistance(x, z).distance < 2 + margin * .5) return true;
  if (Math.hypot((x - MARSH.center[0]) / (MARSH.halfWidth + margin), (z - MARSH.center[1]) / (MARSH.halfDepth + margin)) < 1.15) return true;
  return Math.abs(x - 4.5) < 3.2 + margin && z < -16.2 + margin && z > -23.2 - margin;
}
/** 1 in the marsh's mud, easing to a damp earth over the metre beyond it. */
export function mudAt(x, z) { return 1 - smoothstep(marshValley(x, z), -.45, -.04); }

/** The ground's own look as one small RGBA texture (open ground, sand, mud, damp) for the forest's ground shader. */
function bakeMask() {
  const width = BOX.width * BOX.texels, height = BOX.depth * BOX.texels, data = new Uint8Array(width * height * 4);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = BOX.x + (i + .5) / BOX.texels, z = BOX.z + (j + .5) / BOX.texels, k = (j * width + i) * 4, mud = mudAt(x, z);
    const damp = Math.max(1 - smoothstep(riverDistance(x, z).distance, RIVER.halfWidth, RIVER.halfWidth + 1.1), 1 - smoothstep(Math.hypot((x - MARSH.center[0]) / (MARSH.halfWidth + 1.6), (z - MARSH.center[1]) / (MARSH.halfDepth + 1.4)), .8, 1.25));
    data[k] = Math.round(openAt(x, z) * 255); data[k + 1] = Math.round(sandAt(x, z) * 255); data[k + 2] = Math.round(mud * 255); data[k + 3] = Math.round(damp * 255);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;
  return texture;
}

// The forest's ground shader (world/forest/terrain.js) stays as it is for every other game. Here the memory game lays its own
// colours over it: bright meadow, sandy trails and places with ragged edges, mud round the marsh, and the sunlit open ground.
const COLOURS = Object.freeze({
  uGrassBase: '#56882b', uGrassSun: '#8fb23e', uClover: '#74a53d', uForestA: '#44692f', uForestB: '#5b7d38',
  uCanopyLight: '#6f9a3c', uCanopyDark: '#2c4a26', uBedDark: '#44702a', uBedLight: '#7aa538', uSand: '#f3daa0', uSandDark: '#deba82', uSandRim: '#b08c5a', uMud: '#5a4630', uMudWet: '#3f3322', uDamp: '#7a6038',
});
const BEDS = 8; // the leaves
const SHADER = Object.freeze({
  head: `uniform sampler2D uMemMask; uniform vec4 uMemBox; uniform vec2 uBeds[ ${BEDS} ]; uniform vec3 uBedDark, uBedLight, uCanopyLight, uCanopyDark, uSand, uSandDark, uSandRim, uMud, uMudWet, uDamp;`,
  // Seen from above, the forest beyond the open ground is a canopy: broad lighter and darker blotches of leaves.
  canopy: ['floorC = mix( floorC, uMoss, smoothstep( 0.45, 0.75, coarse ) * 0.5 );', `floorC = mix( floorC, uMoss, smoothstep( 0.45, 0.75, coarse ) * 0.5 );
  floorC = mix( floorC, uCanopyLight * ( 0.85 + 0.3 * fine ), smoothstep( 0.52, 0.78, nB.r + ( med - 0.5 ) * 0.3 ) * 0.7 );
  floorC = mix( floorC, uCanopyDark, smoothstep( 0.56, 0.8, nB.g + ( fine - 0.5 ) * 0.2 ) * 0.55 );`],
  floor: ['vec3 col = mix( grass, floorC, smoothstep( 0.05, 0.95, m.b ) );', 'vec4 mem = texture2D( uMemMask, ( gp - uMemBox.xy ) / uMemBox.zw );\n  vec3 col = mix( grass, floorC, smoothstep( 0.05, 0.95, m.b * ( 1.0 - mem.r ) ) );'],
  litter: ['col = mix( col, mix( uLitterA, uLitterB, smoothstep( 0.3, 0.7, nA.r ) ) * 0.8, litter * 0.55 );', 'col = mix( col, mix( uLitterA, uLitterB, smoothstep( 0.3, 0.7, nA.r ) ) * 0.8, litter * 0.55 * ( 1.0 - mem.r ) );'],
  // After the forest's own trail: sand with grain and small stones, a darker rim, damp earth by the water, mud in the marsh.
  trail: ['col = mix( col, pathC, pathEdge );', `col = mix( col, pathC, pathEdge * ( 1.0 - mem.r ) );
  float sandEdge = mem.g + ( nA.g - 0.5 ) * 0.5 + ( fine - 0.5 ) * 0.22;
  float sandCover = smoothstep( 0.36, 0.56, sandEdge );
  vec3 sandC = mix( uSand, uSandDark, smoothstep( 0.35, 0.75, nA.r ) * 0.45 ) * ( 0.9 + 0.2 * fine );
  sandC = mix( sandC, uSandRim, ( 1.0 - smoothstep( 0.5, 0.78, sandEdge ) ) * 0.6 );
  sandC *= 1.0 - 0.16 * smoothstep( 0.8, 0.9, nC.b ) * smoothstep( 0.55, 0.8, mem.g );
  col = mix( col, sandC, sandCover );
  // A bed of moss and clover under each leaf, with a ragged edge.
  float bed = 0.0;
  for ( int i = 0; i < ${BEDS}; i ++ ) bed = max( bed, 1.0 - smoothstep( 0.95, 1.7, length( ( gp - uBeds[ i ] ) * vec2( 1.0, 0.8 ) ) + ( nA.g - 0.5 ) * 0.9 + ( fine - 0.5 ) * 0.3 ) );
  col = mix( col, mix( uBedDark, uBedLight, smoothstep( 0.3, 0.75, nC.r ) ) * ( 0.85 + 0.3 * fine ), bed * 0.92 );
  col = mix( col, mix( col, uDamp, 0.55 ) * ( 0.9 + 0.16 * fine ), mem.a * ( 1.0 - sandCover * 0.5 ) * ( 1.0 - mem.b ) );
  float mudCover = smoothstep( 0.18, 0.5, mem.b + ( nA.g - 0.5 ) * 0.35 );
  col = mix( col, mix( uMud, uMudWet, smoothstep( 0.45, 0.9, mem.b ) ) * ( 0.85 + 0.3 * fine ), mudCover );
  float puddle = smoothstep( 0.6, 0.68, nA.g * 0.8 + nC.r * 0.3 ) * smoothstep( 0.1, 0.28, mem.b ) * ( 1.0 - smoothstep( 0.6, 0.85, mem.b ) );
  col = mix( col, vec3( 0.2, 0.26, 0.26 ), puddle * 0.75 );`],
  shade: ['float shade = texture2D( uShadeMask, ( gp - uMaskOrigin ) / uMaskSize ).r;', 'float shade = texture2D( uShadeMask, ( gp - uMaskOrigin ) / uMaskSize ).r * ( 1.0 - mem.r );'],
  // The forest's soft grass contrast, narrowed for this broader open floor (as the game had it).
  contrast: [['( 0.84 + 0.3 * nA.a )', '( 0.95 + 0.10 * nA.a )'], ['smoothstep( 0.6, 0.74, nB.g ) * 0.55', 'smoothstep( 0.6, 0.74, nB.g ) * 0.16'], ['soil );', 'soil * 0.3 );'], ['litter * 0.55', 'litter * 0.2']],
});

/** Lays the memory game's look over the forest's ground material. Returns { dispose }. */
export function installGroundLook(material, { beds = [] } = {}) {
  const mask = bakeMask(), box = new THREE.Vector4(BOX.x, BOX.z, BOX.width, BOX.depth);
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    for (const [name, hex] of Object.entries(COLOURS)) (shader.uniforms[name] ??= { value: new THREE.Color() }).value.set(hex);
    shader.uniforms.uLeafShadow.value = .16; shader.uniforms.uForestSun.value = .4; shader.uniforms.uBeds = { value: Array.from({ length: BEDS }, (_, i) => new THREE.Vector2(...(beds[i] ?? [1e4, 1e4]))) }; shader.uniforms.uMemMask = { value: mask }; shader.uniforms.uMemBox = { value: box };
    let source = shader.fragmentShader;
    const swap = ([from, to]) => { if (!source.includes(from)) console.warn(`[memory ground] the forest ground shader changed: ${from.slice(0, 48)}`); source = source.replace(from, to); };
    source = source.replace('#include <common>', `#include <common>\n${SHADER.head}`);
    [SHADER.canopy, SHADER.floor, SHADER.litter, SHADER.trail, SHADER.shade].forEach(swap); SHADER.contrast.forEach(swap);
    shader.fragmentShader = source;
  };
  material.customProgramCacheKey = () => `${key()}-memory-ground-v2`;
  material.needsUpdate = true;
  return { dispose() { mask.dispose(); } };
}
