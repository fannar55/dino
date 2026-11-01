// The real look of Árdalurinn (chapter 4's flight, chunk 2): the ground's colours, the gorge's layered sandstone and the plants'
// materials, the forest's own with one thing more: the reeds and the plants bend away under her as she passes (her downwash).
//
//   groundPaint(terrain, route)(x, z, y, ny) -> [r, g, b, rock]   the ground's colour at a vertex (linear), and how much of it is bare
//                                                                    rock (the walls of the gorge and the cliff of the falls: sandstone)
//   createGroundMaterial(noise) -> material                       a Lambert with that colour, broken up by the noise at two scales,
//                                                                    and the sandstone's layers where it is rock
//   createPlantMaterials(world, { noise, leaf }) -> { solid, thin, downwash, dispose() }   the forest's vegetation materials
//                                                                    (world/forest/materials.js), with `downwash` (a Vector4: her body
//                                                                    and how far round it the air pushes the plants away; w 0 is none)
import * as THREE from 'three';
import { PALETTE, FEN, FOREST } from '../forest/config.js';
import { createSharedUniforms, createVegetationMaterial } from '../forest/materials.js';
import { ACTOR_GLSL } from '../forest/terrain.js';
import { RAPIDS } from './river.js';

const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const linear = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // three's colour management: hex in, linear out
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// The ground's colours. The valley is the forest's grass, sunnier further up its sides; the Fen round the snag is its golden reed
// ground; the banks of the lazy reach are sand, of the rapids gravel; the bed is mud; the walls are sandstone (its layers: the shader).
export const GROUND = {
  grass: linear(PALETTE.grassBase), grassSun: linear(PALETTE.grassSun), moss: linear(PALETTE.moss),
  fen: linear(FEN.grassBase), fenSun: linear(FEN.grassSun),
  sand: linear('#c8ad80'), gravel: linear('#9c927f'), mud: linear(FEN.mud),
  stone: ['#c49a68', '#a87b52', '#dcc092'].map(hex => new THREE.Color(hex)),
};

/** A cheap smooth noise of the ground (0 to 1), for patches of colour baked into the vertices. */
const patch = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.047 + 1.3) * Math.sin(z * 0.039 - 0.7) + 0.25 * Math.sin(x * 0.11 - z * 0.083 + 2.1);

/** The ground's colour at a vertex: [r, g, b] (linear) and its share of bare rock. */
export function groundPaint(terrain, route) {
  return (x, z, y, ny) => {
    const w = terrain.where(x, z);
    const n = patch(x, z);
    let colour = mix(GROUND.grass, GROUND.grassSun, smooth((w.e - 10) / 70) * 0.7 + (n - 0.5) * 0.5);
    colour = mix(colour, GROUND.moss, smooth((n - 0.62) / 0.2) * 0.6);
    colour = mix(colour, mix(GROUND.fen, GROUND.fenSun, n), w.fen);
    // the banks: sand on the lazy reach, gravel by the rapids; mud under the water
    const bank = (1 - smooth((w.e - 1.5) / 3)) * (1 - w.fen * 0.6);
    colour = mix(colour, w.d < RAPIDS.from ? GROUND.sand : GROUND.gravel, bank);
    if (w.e < 0) colour = mix(colour, GROUND.mud, smooth(-w.e / 2));
    if (w.toPool < route.pool.radius + 3) colour = mix(colour, GROUND.mud, smooth((route.pool.radius + 3 - w.toPool) / 4) * 0.8);
    // bare rock where the ground stands steep: the gorge's walls, the cliff of the falls, the step at the lip
    const rock = smooth((0.8 - ny) / 0.25);
    return [colour[0], colour[1], colour[2], rock];
  };
}

/** The ground's material: its vertex colour broken up at two scales, and the sandstone's layers where it is rock (aRock). */
export function createGroundMaterial(noise) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.name = 'ardalur-ground';
  const uniforms = {
    uNoise: { value: noise },
    uStoneA: { value: GROUND.stone[0] }, uStoneB: { value: GROUND.stone[1] }, uStoneC: { value: GROUND.stone[2] },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRock;\nvarying float vRock;\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRock = aRock;\n  vGround = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uNoise;
uniform vec3 uStoneA;
uniform vec3 uStoneB;
uniform vec3 uStoneC;
varying float vRock;
varying vec3 vGround;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  // patches: broad ones and small ones, so the grass is never one flat green
  float broad = texture2D( uNoise, vGround.xz * 0.019 ).r;
  float fine = texture2D( uNoise, vGround.xz * 0.14 + 0.31 ).g;
  diffuseColor.rgb *= ( 0.84 + 0.3 * broad ) * ( 0.9 + 0.18 * fine );
  // sandstone in layers: bands about 2.4 m apart, wavering along the wall, a pale one now and then, rough within each
  if ( vRock > 0.01 ) {
    float waver = texture2D( uNoise, vGround.xz * 0.011 ).b;
    float band = fract( vGround.y * 0.42 + waver * 1.6 );
    vec3 stone = mix( uStoneA, uStoneB, smoothstep( 0.32, 0.5, band ) );
    stone = mix( stone, uStoneC, smoothstep( 0.8, 0.9, band ) * ( 1.0 - smoothstep( 0.95, 1.0, band ) ) );
    stone *= 0.82 + 0.3 * texture2D( uNoise, vec2( vGround.x + vGround.z, vGround.y * 2.0 ) * 0.17 ).r;
    diffuseColor.rgb = mix( diffuseColor.rgb, stone, vRock );
  }`);
  };
  material.customProgramCacheKey = () => 'ardalur-ground';
  return material;
}

// Her downwash: every part of a plant within uDownwash.w metres of her body is pushed away from her and a little down, by up to
// DOWNWASH times what it bends at full wind (aWind.y, its sway: nothing at a plant's foot, most at its tips), fading over the outer
// two thirds of the reach, with a fast flutter on top.
const DOWNWASH = 2.2;
const DOWNWASH_GLSL = /* glsl */`
uniform vec4 uDownwash;
vec3 ardalurDownwash( vec3 wp, vec4 w ) {
  if ( uDownwash.w <= 0.0 ) return vec3( 0.0 );
  vec3 d = wp - uDownwash.xyz;
  float k = 1.0 - smoothstep( 0.35 * uDownwash.w, uDownwash.w, length( d ) );
  if ( k <= 0.0 ) return vec3( 0.0 );
  float sway = w.y * ${FOREST.wind.swayScale.toFixed(3)} * ${DOWNWASH.toFixed(2)} * k;
  vec2 away = d.xz / max( length( d.xz ), 0.5 );
  float flutter = 0.12 * sin( uWindTime * 13.0 + w.x * 40.0 );
  return vec3( away.x * ( 1.0 + flutter ), -0.45, away.y * ( 1.0 - flutter ) ) * sway;
}`;
const PIVOT_LINE = 'transformed += forestPivot( forestRest, aWind, aPivot );';

function withDownwash(material, key, downwash) {
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms.uDownwash = downwash;
    if (!shader.vertexShader.includes(PIVOT_LINE)) console.warn('[ardalur] the vegetation shader changed: no downwash');
    // just before main, after the forest's head (it declares the wind's clock this reads)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${DOWNWASH_GLSL}\nvoid main() {`)
      .replace(PIVOT_LINE, `${PIVOT_LINE}\n  transformed += ardalurDownwash( forestRest, aWind );`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** The plants' materials: the forest's (solid and double-sided thin parts), bending away under her. */
export function createPlantMaterials(world, { noise, leaf }) {
  const shared = createSharedUniforms(world, noise, leaf, 0);
  // no footprints in the valley: the ferns lean from nobody (the forest's capsules, none of them used)
  const actors = {
    glsl: ACTOR_GLSL,
    uniforms: {
      uActors: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)) },
      uActorShape: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(1, 1, 1, 0)) },
      uActorCount: { value: 0 },
      uActorWarm: { value: 0 },
    },
  };
  const downwash = { value: new THREE.Vector4(0, 0, 0, 0) };
  const low = world.q?.name === 'low';
  const solid = withDownwash(createVegetationMaterial(shared, { side: THREE.FrontSide, key: 'ardalur-solid', low, actors }), `ardalur-solid${low ? '-low' : ''}`, downwash);
  const thin = withDownwash(createVegetationMaterial(shared, { side: THREE.DoubleSide, key: 'ardalur-thin', low, actors }), `ardalur-thin${low ? '-low' : ''}`, downwash);
  return {
    solid, thin, downwash: downwash.value,
    dispose() { solid.dispose(); thin.dispose(); },
  };
}
