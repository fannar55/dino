// A world with the light main.js gives it (for the tests of engine/light-blend.js and world/fjall).
import * as THREE from 'three';
import { LOOKS } from '../engine/looks.js';
import { createEffects } from '../engine/effects.js';
import { sunDirection } from '../engine/lighting.js';

/** A world as main.js makes one, its light from `look`: the sun and the fill, the fog, the sky's uniforms, the exposure. */
export function lightWorld(look = LOOKS.lowSun) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);
  const sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity);
  sun.position.copy(sunDirection(look)).multiplyScalar(40);
  const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
  const c = hex => new THREE.Color(hex);
  const uniforms = {
    uZenith: { value: c(look.sky.zenith) }, uHorizon: { value: c(look.sky.horizon) }, uGlow: { value: c(look.sky.glow) },
    uCloud: { value: c(look.sky.cloud) }, uCloudShade: { value: c(look.sky.cloudShade) }, uFogColor: { value: c(look.fog.color) },
    uFogSun: { value: c(look.fog.sunColor) }, uSunDir: { value: sunDirection(look) }, uCover: { value: look.sky.cloudCover },
    uFogSunStrength: { value: look.fog.sunStrength },
  };
  return {
    scene, look, effects: createEffects(),
    lighting: { sun, hemi, direction: sunDirection(look) },
    sky: { dome: { material: { uniforms } } },
    renderer: { toneMappingExposure: look.exposure },
  };
}

