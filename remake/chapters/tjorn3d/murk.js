// The pond's murk (chapters/tjorn3d.js): under the water's surface everything fades into a dim tone, the more the longer the
// eye's ray runs under the water, and the tone is darker the deeper the thing lies; over the surface nothing changes. It takes the
// place of the look's mist (engine/fog.js, which patches the same two chunks of three's shaders for every material that takes fog,
// and gives them the world's point, vFogWorld): the table has no mist over it. Display-space colours, as the mist's.
//
//   installMurk(scene, { level, tone, deep, bed, density })   level: the surface's height (m); tone: the murk's colour near the
//       surface; deep: how much of it is left at the bed (0 to 1); bed: metres under the surface where it is darkest; density: per
//       metre of ray under the water (scene.fog.density from then on: it may be changed while the page runs)
//   murky(material)   a material made after that takes the murk too (its program is not shared with one compiled before it)
import * as THREE from 'three';

const KEY = '|tjorn-murk';

function displayVec3(hex) {
  const c = new THREE.Color(hex);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, THREE.SRGBColorSpace);
  return `vec3(${out.r.toFixed(4)}, ${out.g.toFixed(4)}, ${out.b.toFixed(4)})`;
}

/** How much of a thing `under` metres under the surface comes through the murk, seen along a ray `steep` degrees down from level. */
export const through = (under, density, steep = 45) => Math.exp((-density * Math.max(0, under)) / Math.sin((steep * Math.PI) / 180));

export function murky(material) {
  if (!material || material.userData?.murk) return material;
  const own = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => own() + KEY;
  material.userData.murk = true;
  material.needsUpdate = true;
  return material;
}

export function installMurk(scene, { level, tone, deep, bed, density }) {
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
	#define MURK_LEVEL ${level.toFixed(4)}
	#define MURK_TONE ${displayVec3(tone)}
	#define MURK_DEEP ${deep.toFixed(4)}
	#define MURK_BED ${bed.toFixed(4)}
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
	float murkUnder = MURK_LEVEL - vFogWorld.y;
	if (murkUnder > 0.0) {
		vec3 murkRay = cameraPosition - vFogWorld;
		#ifdef FOG_EXP2
			float murkPath = murkUnder * length(murkRay) / max(murkRay.y, 0.5);
			float murkFactor = 1.0 - exp(-fogDensity * murkPath);
		#else
			float murkFactor = smoothstep(fogNear, fogFar, murkUnder);
		#endif
		vec3 murkTone = MURK_TONE * mix(1.0, MURK_DEEP, clamp(murkUnder / MURK_BED, 0.0, 1.0));
		gl_FragColor.rgb = mix(gl_FragColor.rgb, murkTone, murkFactor);
	}
#endif`;
  if (scene.fog) scene.fog.density = density;
  // whatever was compiled with the mist is compiled again with the murk
  const seen = new Set();
  scene.traverse(o => { for (const m of [o.material, o.customDepthMaterial].flat()) if (m && !seen.has(m)) { seen.add(m); if (m.fog !== false) murky(m); } });
  return scene.fog;
}
