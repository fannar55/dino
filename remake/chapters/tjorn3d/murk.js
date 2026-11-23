// The pond's murk (chapters/tjorn3d.js): under the water's surface everything is dimmer the deeper it lies (less light gets down
// to it) and fades into the water's own tone the longer the eye's ray runs under the water; at the bed nothing is left but the
// tone, a little darker there than near the surface. So what is near the surface is clear, what is deep is a dark shape in
// mid-toned water, and the bed is never seen: over the surface nothing changes. It takes the place of the look's mist
// (engine/fog.js, which patches the same two chunks of three's shaders for every material that takes fog, and gives them the
// world's point, vFogWorld): the table has no mist over it. Display-space colours, as the mist's.
//
//   installMurk(scene, { level, tone, deep, dim, bed, density })   level: the surface's height (m); tone: the water's colour seen
//       through much of it; deep: how much of the tone is left at the bed (0 to 1); dim: how fast a thing's own colour darkens
//       with its depth (per metre); bed: metres under the surface where only the tone is left; density: per metre of ray under
//       the water (scene.fog.density from then on: it may be changed while the page runs)
//   murky(material)   a material made after that takes the murk too (its program is not shared with one compiled before it)
import * as THREE from 'three';

const KEY = '|tjorn-murk';
let savedChunks = null;

function displayVec3(hex) {
  const c = new THREE.Color(hex);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, THREE.SRGBColorSpace);
  return `vec3(${out.r.toFixed(4)}, ${out.g.toFixed(4)}, ${out.b.toFixed(4)})`;
}

/**
 * How much of a thing's own colour comes through, `under` metres under the surface, seen along a ray `steep` degrees down from
 * level: what the depth leaves of its light, times what the ray's way under the water lets through.
 */
export const through = (under, { density, dim }, steep = 45) => Math.exp(-dim * Math.max(0, under)) * Math.exp((-density * Math.max(0, under)) / Math.sin((steep * Math.PI) / 180));

export function murky(material) {
  if (!material || material.userData?.murk) return material;
  const own = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => own() + KEY;
  material.userData.murk = true;
  material.needsUpdate = true;
  return material;
}

export function installMurk(scene, { level, tone, deep, dim, bed, density }) {
  savedChunks ??= {
    fog_pars_fragment: THREE.ShaderChunk.fog_pars_fragment,
    fog_fragment: THREE.ShaderChunk.fog_fragment,
  };
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
	#define MURK_LEVEL ${level.toFixed(4)}
	#define MURK_TONE ${displayVec3(tone)}
	#define MURK_DEEP ${deep.toFixed(4)}
	#define MURK_DIM ${dim.toFixed(4)}
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
		float murkDepth = clamp(murkUnder / MURK_BED, 0.0, 1.0);
		murkFactor = max(murkFactor, smoothstep(0.82, 1.0, murkDepth));
		vec3 murkTone = MURK_TONE * mix(1.0, MURK_DEEP, murkDepth);
		gl_FragColor.rgb = mix(gl_FragColor.rgb * exp(-MURK_DIM * murkUnder), murkTone, murkFactor);
	}
#endif`;
  if (scene.fog) scene.fog.density = density;
  // whatever was compiled with the mist is compiled again with the murk
  const seen = new Set();
  scene.traverse(o => { for (const m of [o.material, o.customDepthMaterial].flat()) if (m && !seen.has(m)) { seen.add(m); if (m.fog !== false) murky(m); } });
  return scene.fog;
}

/** Restores Three's fog shader chunks to what they were before installMurk patched them. */
export function restoreMurk() {
  if (!savedChunks) return;
  THREE.ShaderChunk.fog_pars_fragment = savedChunks.fog_pars_fragment;
  THREE.ShaderChunk.fog_fragment = savedChunks.fog_fragment;
  savedChunks = null;
}
