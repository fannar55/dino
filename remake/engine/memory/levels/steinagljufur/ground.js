import * as THREE from 'three';
import { installGroundLook } from '../berjalundur/ground.js';

const { smoothstep } = THREE.MathUtils;

/**
 * The floor of the gorge and its walls, in the glade's own frame. The leaves are a grid turned toward the search camera (levels/*.js `grid`):
 * `u` runs across the landscape view (to the right), `v` away from the camera. Everything about the place is told in (u, v) and turned into
 * the world's (x, z) here.
 *
 * The floor is a rounded rectangle (FLOOR). The walls close the back and the left of it and leave the front and the right open, because the
 * search camera looks in from the front (landscape) or from the right (portrait): `closure` is 1 where a wall stands and fades to 0 over the
 * open side, and the ground rises (`liftAt`) behind the walls to the plateau the gorge cuts into.
 */
export function frameOf(grid) {
  const [cx, cz] = grid.centre, c = Math.cos(grid.angle), s = Math.sin(grid.angle), a = [c, -s], d = [-s, -c];
  return Object.freeze({
    a, d, centre: grid.centre,
    toGrid: (x, z) => [(x - cx) * a[0] + (z - cz) * a[1], (x - cx) * d[0] + (z - cz) * d[1]],
    toWorld: (u, v) => [cx + u * a[0] + v * d[0], cz + u * a[1] + v * d[1]],
    // The yaw (rotation about Y) that turns +X toward the direction (du, dv) of the grid.
    yawToward: (du, dv) => -Math.atan2(du * a[1] + dv * d[1], du * a[0] + dv * d[0]),
  });
}

/** The floor: half sizes, middle and the rounding of its corners, in metres of the grid. */
export const FLOOR = Object.freeze({ centre: [0, .2], half: [12.6, 12], round: 4.5 });
/** The open side looks toward this angle of the grid (radians from +u toward +v): the front, a little to the right (both search cameras are on it). */
const OPEN_ANGLE = -Math.PI / 3;

/** Metres outside the floor (negative inside it). */
export function outside(u, v) {
  const qx = Math.abs(u - FLOOR.centre[0]) - (FLOOR.half[0] - FLOOR.round), qz = Math.abs(v - FLOOR.centre[1]) - (FLOOR.half[1] - FLOOR.round);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - FLOOR.round;
}
/** 1 where a wall stands (the back and the left), 0 on the open side, with a long ramp between. */
export function closure(u, v) {
  const angle = Math.atan2(v, u), turn = Math.abs(Math.atan2(Math.sin(angle - OPEN_ANGLE), Math.cos(angle - OPEN_ANGLE)));
  return smoothstep(turn, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(100));
}
/** How high the plateau stands behind the walls (metres above the floor). */
export const PLATEAU = 9.5;

/** What the ground is lifted by at (x, z): the floor is flat, behind the walls it climbs to the plateau, and stays there. */
export function liftOf(frame) {
  return (x, z) => {
    const [u, v] = frame.toGrid(x, z);
    return PLATEAU * closure(u, v) * smoothstep(outside(u, v), .6, 9.5);
  };
}

// Where the ground mask is baked: this many texels to the metre over this box (the glade is at its middle).
const TEXELS = 3, SIZE = 110;
function bakeMask(frame) {
  const width = SIZE * TEXELS, data = new Uint8Array(width * width * 4), [cx, cz] = frame.centre;
  for (let j = 0; j < width; j++) for (let i = 0; i < width; i++) {
    const x = cx - SIZE / 2 + (i + .5) / TEXELS, z = cz - SIZE / 2 + (j + .5) / TEXELS, [u, v] = frame.toGrid(x, z), out = outside(u, v), k = (j * width + i) * 4;
    // R: the open floor (the forest's floor and canopy colours stay away); G: the sand, to the foot of the wall; B, A: no mud, no damp.
    data[k] = Math.round((1 - smoothstep(out, 1.5, 9)) * 255);
    data[k + 1] = Math.round((1 - smoothstep(out, -2.8, 1.2)) * 255);
  }
  const texture = new THREE.DataTexture(data, width, width, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;
  return texture;
}

// The forest's ground shader with the gorge's colours: dusty ochre ground that the wall's sandstone stands on, a paler sand on the floor and a
// darker patch of it under each leaf.
const COLOURS = Object.freeze({
  uGrassBase: '#b8895a', uGrassSun: '#d8ac72', uClover: '#aa8052', uForestA: '#9c7249', uForestB: '#87623f', uCanopyLight: '#b98657', uCanopyDark: '#7a5539',
  uBedDark: '#b88a55', uBedLight: '#d4a96d', uSand: '#efd0a0', uSandDark: '#dbb27a', uSandRim: '#b58758', uMud: '#6a4a35', uMudWet: '#4d3626', uDamp: '#8a6844',
  uMoss: '#a98255', uSoil: '#8e6a47', uSoilDark: '#6a4a35', uPath: '#d9b583', uPathEdge: '#b38859', uLitterA: '#a97e52', uLitterB: '#8a6542',
});

/** Lays the gorge's ground look over the forest's ground material (the leaves' places make their beds). Returns { dispose }. */
export function installGorgeGround(material, frame, { beds = [] } = {}) {
  const mask = bakeMask(frame), [cx, cz] = frame.centre;
  const look = installGroundLook(material, { beds, bedCount: Math.max(16, beds.length), mask, box: new THREE.Vector4(cx - SIZE / 2, cz - SIZE / 2, SIZE, SIZE), colours: COLOURS });
  return { dispose() { look.dispose(); mask.dispose(); } };
}


// The upper gorge's ground (upper.js) is drawn with the glade's own ground material, so that the two read as one gorge: the same noise, the same sand with its grain and darker rim, the same
// shadows and the same warmth round a friend. Its vertices carry `aRock` (1 + how steep the ground is there: 0 is missing, which is every vertex of the glade's own ground); where the ground
// is steep it is layered sandstone instead of sand, in the colours of the cliff pieces (their texture is a per-model atlas and cannot be laid over a slope).
const ROCK = Object.freeze({ uRockA: '#a64d2a', uRockB: '#c0663a', uRockC: '#7e3419' });

/** Lays the upper gorge's look over the glade's ground material (after installGorgeGround). Returns { dispose }. */
export function installUpperGroundLook(material) {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    for (const [name, hex] of Object.entries(ROCK)) shader.uniforms[name] = { value: new THREE.Color(hex) };
    const swap = (stage, from, to) => { if (!shader[stage].includes(from)) console.warn(`[upper ground] the forest ground shader changed: ${from.slice(0, 48)}`); shader[stage] = shader[stage].replace(from, () => to); };
    swap('vertexShader', '#include <common>', '#include <common>\nattribute float aRock;\nvarying float vRock;');
    swap('vertexShader', 'vGroundPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;', 'vGroundPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n  vRock = aRock;');
    swap('fragmentShader', '#include <common>', '#include <common>\nvarying float vRock;\nuniform vec3 uRockA, uRockB, uRockC;');
    swap('fragmentShader', 'diffuseColor.rgb = col * ao;', `if ( vRock > 0.5 ) {
    // steep ground: layered sandstone (bands of height, broken by the noise); flat ground: the glade's sand
    float steep = vRock - 1.0 + ( fine - 0.5 ) * 0.1 + ( med - 0.5 ) * 0.1;
    float rockCover = smoothstep( 0.2, 0.34, steep );
    vec3 sandC = mix( uSand, uSandDark, smoothstep( 0.35, 0.75, nA.r ) * 0.45 ) * ( 0.9 + 0.2 * fine );
    sandC = mix( sandC, uSandRim, smoothstep( 0.1, 0.24, steep ) * 0.6 );
    sandC *= 1.0 - 0.16 * smoothstep( 0.8, 0.9, nC.b );
    float strata = sin( vGroundPos.y * 4.6 + nB.g * 7.0 + nA.r * 2.5 );
    vec3 rockC = mix( uRockA, uRockB, smoothstep( 0.25, 0.75, nA.r ) ) * ( 0.88 + 0.22 * fine );
    rockC = mix( rockC, uRockC, smoothstep( 0.5, 0.95, strata ) * 0.45 );
    col = mix( sandC, rockC, rockCover );
    col = mix( col, col * vec3( 1.2, 1.14, 0.84 ) + vec3( 0.02, 0.016, 0.0 ), nearActor * 0.75 * uActorWarm * ( 1.0 - rockCover ) );
  }
  diffuseColor.rgb = col * ao;`);
  };
  material.customProgramCacheKey = () => `${key()}-upper-ground-v1`;
  material.needsUpdate = true;
  return { dispose() {} };
}
