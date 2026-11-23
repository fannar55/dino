import * as THREE from 'three';

// Height fog with sun in-scattering, patched into three's fog chunks so every built-in material
// receives it. Custom ShaderMaterials join in by setting `fog: true` and including the four fog
// chunks; their vertex shader must define `mvPosition` before `#include <fog_vertex>`.
//
// three applies fog_fragment after tone mapping and sRGB conversion, so the colours here are
// display-space values and match the style guide's hex codes directly.
//
// Density follows a(y) = density * exp(-falloff * y). The fog along the view ray is the analytic
// integral of that density, so distant ground fades smoothly and high branches stay clearer.

function srgbVec3(hex) {
  const c = new THREE.Color(hex);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, THREE.SRGBColorSpace);
  return `vec3(${out.r.toFixed(4)}, ${out.g.toFixed(4)}, ${out.b.toFixed(4)})`;
}

const FOG_PARS_VERTEX = '#ifdef USE_FOG\n\tvarying vec3 vFogWorld;\n#endif';
const FOG_VERTEX = '#ifdef USE_FOG\n\tvFogWorld = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz + cameraPosition;\n#endif';
const FOG_FRAGMENT = `#ifdef USE_FOG
	vec3 fogRay = vFogWorld - cameraPosition;
	float fogDist = max(length(fogRay), 1e-4);
	vec3 fogDir = fogRay / fogDist;
	#ifdef FOG_EXP2
		float fogBase = fogDensity * exp(clamp(-FOG_FALLOFF * max(cameraPosition.y, 0.0), -20.0, 0.0));
		float fogPath = abs(fogDir.y) > 1e-3 ? (1.0 - exp(clamp(-FOG_FALLOFF * fogRay.y, -20.0, 20.0))) / (FOG_FALLOFF * fogDir.y) : fogDist;
		float fogFactor = 1.0 - exp(-clamp(fogBase * fogPath, 0.0, 20.0));
	#else
		float fogFactor = smoothstep(fogNear, fogFar, fogDist);
	#endif
	float fogDot = max(dot(fogDir, FOG_SUN_DIR), 0.0);
	float fogDot2 = fogDot * fogDot;
	float fogDot4 = fogDot2 * fogDot2;
	float fogSun = (fogDot4 * fogDot4) * FOG_SUN_STRENGTH;
	gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, FOG_SUN_COLOR, fogSun), fogFactor);
	gl_FragColor.rgb += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
#endif`;

const sceneFogPars = new WeakMap();

/** Restore THREE's fog shader chunks to match `scene` (installed by `installFog`) before compiling or rendering `scene`. */
export function applyFog(scene) {
  const pars = sceneFogPars.get(scene);
  if (!pars) return;
  if (THREE.ShaderChunk.fog_pars_vertex !== FOG_PARS_VERTEX) THREE.ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
  if (THREE.ShaderChunk.fog_vertex !== FOG_VERTEX) THREE.ShaderChunk.fog_vertex = FOG_VERTEX;
  if (THREE.ShaderChunk.fog_pars_fragment !== pars) THREE.ShaderChunk.fog_pars_fragment = pars;
  if (THREE.ShaderChunk.fog_fragment !== FOG_FRAGMENT) THREE.ShaderChunk.fog_fragment = FOG_FRAGMENT;
}

const hookedScenes = new WeakSet();

export function installFog(scene, look, sunDir) {
  scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);
  const defines = [
    `#define FOG_FALLOFF ${look.fog.heightFalloff.toFixed(4)}`,
    `#define FOG_SUN_DIR normalize(vec3(${sunDir.x.toFixed(4)}, ${sunDir.y.toFixed(4)}, ${sunDir.z.toFixed(4)}))`,
    `#define FOG_SUN_COLOR ${srgbVec3(look.fog.sunColor)}`,
    `#define FOG_SUN_STRENGTH ${look.fog.sunStrength.toFixed(3)}`,
  ].join('\n');

  const fogParsFragment = `#ifdef USE_FOG
	${defines.split('\n').join('\n\t')}
	uniform vec3 fogColor;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  sceneFogPars.set(scene, fogParsFragment);
  applyFog(scene);

  // Sync the global chunks to this scene right before rendering it so a second scene on the same page (e.g. Háls og hali
  // prewarmed from the book) cannot leave another look's fog constants active for materials compiled later.
  if (!hookedScenes.has(scene)) {
    hookedScenes.add(scene);
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = function fogOnBeforeRender(renderer, s, camera, renderTarget) {
      applyFog(s);
      if (typeof prev === 'function') prev.call(this, renderer, s, camera, renderTarget);
    };
  }
  return scene.fog;
}
