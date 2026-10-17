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

export function installFog(scene, look, sunDir) {
  scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);
  const defines = [
    `#define FOG_FALLOFF ${look.fog.heightFalloff.toFixed(4)}`,
    `#define FOG_SUN_DIR normalize(vec3(${sunDir.x.toFixed(4)}, ${sunDir.y.toFixed(4)}, ${sunDir.z.toFixed(4)}))`,
    `#define FOG_SUN_COLOR ${srgbVec3(look.fog.sunColor)}`,
    `#define FOG_SUN_STRENGTH ${look.fog.sunStrength.toFixed(3)}`,
  ].join('\n');

  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG\n\tvarying vec3 vFogWorld;\n#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG\n\tvFogWorld = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz + cameraPosition;\n#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
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
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
	vec3 fogRay = vFogWorld - cameraPosition;
	float fogDist = max(length(fogRay), 1e-4);
	vec3 fogDir = fogRay / fogDist;
	#ifdef FOG_EXP2
		float fogBase = fogDensity * exp(-FOG_FALLOFF * max(cameraPosition.y, 0.0));
		float fogPath = abs(fogDir.y) > 1e-3 ? (1.0 - exp(-FOG_FALLOFF * fogRay.y)) / (FOG_FALLOFF * fogDir.y) : fogDist;
		float fogFactor = 1.0 - exp(-max(fogBase * fogPath, 0.0));
	#else
		float fogFactor = smoothstep(fogNear, fogFar, fogDist);
	#endif
	float fogSun = pow(max(dot(fogDir, FOG_SUN_DIR), 0.0), 8.0) * FOG_SUN_STRENGTH;
	gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, FOG_SUN_COLOR, fogSun), fogFactor);
#endif`;
  return scene.fog;
}
