// Forest materials. All of them are three's MeshLambertMaterial (cheap, per-pixel, shadows and
// the engine's height fog for free) patched in onBeforeCompile with:
//   - wind from the shared uniforms in engine/wind.js (never copied, the objects are shared),
//   - wrap lighting and a warm glow when foliage is backlit by the sun,
//   - fake canopy shade outside the shadow map: baked sky visibility per vertex plus a cheap
//     dappled-light pattern, so the deep forest is darker without more shadow maps.
import * as THREE from 'three';
import { FOREST, BEAT_SHARE } from './config.js';
import { createRng } from './random.js';

/** Tileable 128x128 noise: R dapple blobs, G medium fbm, B coarse fbm, A fine grain. */
export function createNoiseTexture(seed, size = 128) {
  const rng = createRng(seed, 'noise-texture');
  const lattice = (n) => Float32Array.from({ length: n * n }, () => rng.next());
  const layers = [4, 8, 16, 32, 64].map(n => ({ n, L: lattice(n) }));
  const smooth = t => t * t * (3 - 2 * t);
  const sample = ({ n, L }, x, y) => {
    const fx = (x / size) * n, fy = (y / size) * n;
    const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
    const a = L[y0 * n + x0] + (L[y0 * n + x1] - L[y0 * n + x0]) * tx;
    const b = L[y1 * n + x0] + (L[y1 * n + x1] - L[y1 * n + x0]) * tx;
    return a + (b - a) * ty;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dapple = sample(layers[2], x, y) * 0.6 + sample(layers[3], x, y) * 0.4;
      const medium = sample(layers[1], x, y) * 0.5 + sample(layers[2], x, y) * 0.3 + sample(layers[3], x, y) * 0.2;
      const coarse = sample(layers[0], x, y) * 0.6 + sample(layers[1], x, y) * 0.4;
      const fine = sample(layers[4], x, y) * 0.6 + sample(layers[3], x, y) * 0.4;
      data[i] = Math.round(dapple * 255);
      data[i + 1] = Math.round(medium * 255);
      data[i + 2] = Math.round(coarse * 255);
      data[i + 3] = Math.round(fine * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tileable leaf-clump pattern (cellular noise): R is a soft dome in each cell, G is 1 inside a
 * cell and falls to 0 along the cell borders. Projected on foliage it reads as painted clusters
 * of leaves and hides the facets of the low-poly lobes.
 */
export function createLeafTexture(seed, size = 128, cells = 6) {
  const rng = createRng(seed, 'leaf-texture');
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + 0.7 * rng.next()) / cells, (j + 0.15 + 0.7 * rng.next()) / cells]);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      let f1 = 9, f2 = 9;
      for (const [px, py] of pts) {
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const d = Math.hypot(u - (px + ox), v - (py + oy));
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
      }
      const cell = 1 / cells;
      const dome = Math.max(0, 1 - f1 / (cell * 0.75));
      const edge = Math.min(1, (f2 - f1) / (cell * 0.22));
      const i = (y * size + x) * 4;
      data[i] = Math.round(dome * 255);
      data[i + 1] = Math.round(edge * 255);
      data[i + 2] = Math.round(rng.next() * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// The beat comes on top of the wind: BEAT_SHARE (config.js) of a part's own `sway`, the metres it bends at full wind
// (aWind.y), along the wind and whatever the gust is doing. Trunks, crowns, needles and tree-fern trunks bake their sway from
// maxSwayDeg, so that share is at most beatAmplitudeDeg more lean at their tops: 3 degrees with the beat. Fronds, stems and
// stalks have weights of their own (LEAN in species.js), scaled there so that with the beat they stay within 3 degrees or,
// where they already leaned further, at the peak they had before it. Grass bends far more than any of them and gets the
// same share of its own bend.
export const WIND_GLSL = /* glsl */`
uniform float uWindTime;
uniform float uWindStrength;
uniform vec2 uWindDirection;
uniform float uBeat;
vec3 forestWind(vec3 wp, vec4 w) {
  float phase = w.x * 6.2831853;
  float sway = w.y * ${FOREST.wind.swayScale.toFixed(3)};
  float flutter = w.z * ${FOREST.wind.flutterScale.toFixed(3)};
  float t = uWindTime;
  float along = dot(wp.xz, uWindDirection);
  float gust = 0.5 + 0.5 * sin(along * 0.07 - t * 0.55) * sin(along * 0.023 - t * 0.21 + 1.7);
  float strength = uWindStrength * (0.45 + 0.55 * gust);
  float osc = sin(t * 0.9 + phase) * 0.6 + sin(t * 1.63 + phase * 1.7) * 0.25;
  vec2 side = vec2(-uWindDirection.y, uWindDirection.x);
  float lean = strength * (0.55 + 0.45 * osc) + ${BEAT_SHARE.toFixed(3)} * uBeat; // the beat comes on top, whatever the gust is doing
  vec2 bend = uWindDirection * (sway * lean);
  bend += side * sway * strength * 0.22 * sin(t * 1.27 + phase * 2.3);
  vec3 off = vec3(bend.x, -0.08 * dot(bend, bend), bend.y);
  float f = flutter * strength;
  off += f * vec3(sin(t * 5.1 + phase * 7.0 + wp.y * 1.9), 0.5 * sin(t * 6.3 + phase * 3.0 + wp.x * 1.3), sin(t * 5.7 + phase * 5.0 + wp.z * 2.1));
  return off;
}`;

// Replacement for three's lights_lambert_pars_fragment: wrap lighting, canopy shade, backlit glow.
// gSun scales the sun (after the shadow map), gAmb the sky fill, gLeaf turns on wrap and glow.
export const LIGHTS_GLSL = /* glsl */`
varying vec3 vViewPosition;
struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float NdotL = dot( geometryNormal, directLight.direction );
  float w = mix( 0.12, 0.55, gLeaf );
  float dotNL = saturate( ( NdotL + w ) / ( 1.0 + w ) );
  vec3 light = directLight.color * gSun;
  reflectedLight.directDiffuse += dotNL * light * BRDF_Lambert( material.diffuseColor );
  float back = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 4.0 );
  float through = gLeaf * back * ( 0.35 + 0.65 * saturate( 0.3 - NdotL ) );
  reflectedLight.directDiffuse += through * light * material.diffuseColor * vec3( 1.05, 1.1, 0.5 ) * uTranslucency;
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // shade leans blue-green, never neutral grey
  vec3 shadeTint = mix( vec3( 0.86, 1.0, 1.08 ), vec3( 1.0 ), saturate( gSun ) );
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor ) * gAmb * shadeTint;
}
#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert`;

export const LIGHT_GLOBALS = /* glsl */`
uniform float uTranslucency;
float gSun = 1.0;
float gAmb = 1.0;
float gLeaf = 0.0;
float gShadowUse = 1.0;`;

// The real shadow map only counts where the sky is open (gShadowUse): under the canopy the baked
// shade already says how much sun gets through, and stacking both would turn trunks black. The
// shadow also fades out toward the edges of the shadow camera, so its box never shows as a line.
const SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
const SHADOW_SOFT = `{
			float forestReal = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
			vec3 forestSc = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
			float forestEdge = smoothstep( 0.0, 0.12, min( min( forestSc.x, 1.0 - forestSc.x ), min( forestSc.y, 1.0 - forestSc.y ) ) );
			directLight.color *= mix( 1.0, forestReal, forestEdge * gShadowUse );
		}`;
export function forestLightsBegin() {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(SHADOW_LINE)) console.warn('[forest] lights_fragment_begin changed; real shadows are not softened');
  return chunk.replace(SHADOW_LINE, SHADOW_SOFT);
}

export const SRGB_GLSL = /* glsl */`
vec3 forestSrgbToLinear( vec3 c ) {
  return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) );
}`;

/** Shared uniform objects for every forest material (wind objects are the engine's own). */
export function createSharedUniforms(world, noiseTexture, leafTexture) {
  const w = world.wind.uniforms;
  return {
    uWindTime: w.uWindTime,
    uWindStrength: w.uWindStrength,
    uWindDirection: w.uWindDirection,
    uBeat: w.uBeat,
    uNoise: { value: noiseTexture },
    uLeaf: { value: leafTexture },
    uDapple: { value: FOREST.shade.dapple },
    uTranslucency: { value: 0.55 },
  };
}

function patch(shader, parts) {
  let v = shader.vertexShader;
  let f = shader.fragmentShader;
  if (parts.vertexHead) v = v.replace('#include <common>', `#include <common>\n${parts.vertexHead}`);
  for (const [anchor, code] of parts.vertexAfter || []) v = v.replace(anchor, `${anchor}\n${code}`);
  for (const [from, to] of parts.vertexReplace || []) v = v.replace(from, to);
  if (parts.fragmentHead) f = f.replace('#include <common>', `#include <common>\n${parts.fragmentHead}`);
  if (parts.lights) {
    f = f.replace('#include <lights_lambert_pars_fragment>', LIGHTS_GLSL);
    f = f.replace('#include <lights_fragment_begin>', forestLightsBegin());
  }
  for (const [anchor, code] of parts.fragmentAfter || []) f = f.replace(anchor, `${anchor}\n${code}`);
  shader.vertexShader = v;
  shader.fragmentShader = f;
}

export function patchLambert(material, key, uniforms, parts) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    patch(shader, { lights: true, ...parts });
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/**
 * The vegetation material: one for closed parts (front faces) and one double-sided for fronds,
 * petals and needles. Vertex colour alpha carries the sky visibility, aWind the wind weights.
 */
export function createVegetationMaterial(shared, { side = THREE.FrontSide, key, low = false }) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  material.name = key;
  if (low) material.defines = { FOREST_LOW: '' };
  key = low ? `${key}-low` : key;
  return patchLambert(material, key, shared, {
    vertexHead: `attribute vec4 aWind;\nvarying float vSun;\nvarying float vLeaf;\nvarying vec3 vForestPos;\nvarying vec3 vForestNormal;\n${WIND_GLSL}\n${SRGB_GLSL}`,
    vertexAfter: [
      ['#include <color_vertex>', `
  #ifdef USE_COLOR_ALPHA
    vSun = vColor.a;
    vColor = vec4( forestSrgbToLinear( vColor.rgb ), 1.0 );
  #endif
  vLeaf = aWind.w;`],
      ['#include <begin_vertex>', `
  vec3 forestRest = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  transformed += forestWind( forestRest, aWind );
  vForestPos = forestRest;
  vForestNormal = normalize( mat3( modelMatrix ) * objectNormal );
  // foliage samples the shadow map a little outside its surface: no acne on the lobes
  float forestShadowPush = mix( 0.02, 0.22, aWind.w );`],
    ],
    vertexReplace: [['#include <shadowmap_vertex>', THREE.ShaderChunk.shadowmap_vertex.split('directionalLightShadows[ i ].shadowNormalBias').join('( directionalLightShadows[ i ].shadowNormalBias + forestShadowPush )')]],
    fragmentHead: `uniform sampler2D uNoise;\nuniform sampler2D uLeaf;\nuniform float uDapple;\nuniform float uWindTime;\nvarying float vSun;\nvarying float vLeaf;\nvarying vec3 vForestPos;\nvarying vec3 vForestNormal;\n${LIGHT_GLOBALS}`,
    fragmentAfter: [
      ['#include <color_fragment>', `
  float forestDapple = texture2D( uNoise, vForestPos.xz * 0.16 + vForestPos.y * 0.045 + vec2( uWindTime * 0.003, uWindTime * 0.002 ) ).r;
  forestDapple = smoothstep( 0.6, 0.78, forestDapple );
  gSun = vSun + ( 1.0 - vSun ) * forestDapple * uDapple;
  gAmb = mix( 0.62, 1.0, vSun );
  gShadowUse = smoothstep( 0.55, 0.92, vSun );
  gLeaf = vLeaf;
  diffuseColor.a = 1.0;
  #if !defined( DOUBLE_SIDED ) && !defined( FOREST_LOW )
  if ( vLeaf > 0.5 ) {
    // painted leaf clusters, projected on the plane the surface faces most
    vec3 an = abs( vForestNormal );
    vec2 luv = an.y > max( an.x, an.z ) ? vForestPos.xz : ( an.x > an.z ? vForestPos.zy : vForestPos.xy );
    vec4 lc = texture2D( uLeaf, luv * 0.7 );
    diffuseColor.rgb *= mix( 0.84, 1.06, lc.r ) * mix( 0.93, 1.0, lc.g );
  }
  #endif`],
    ],
  });
}

/** Shadow-pass material that sways with the same wind, so shadows match the moving crowns. */
export function createWindDepthMaterial(shared, key) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.name = `${key}-depth`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shared);
    patch(shader, {
      vertexHead: `attribute vec4 aWind;\n${WIND_GLSL}`,
      vertexAfter: [['#include <begin_vertex>', `
  vec3 forestRest = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  transformed += forestWind( forestRest, aWind );`]],
    });
  };
  material.customProgramCacheKey = () => `${key}-depth`;
  return material;
}
