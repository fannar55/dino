import * as THREE from 'three';

// Shared wind. Every swaying thing reads these uniforms (pass the objects themselves into
// ShaderMaterial.uniforms, never copies), so grass, leaves and particles move as one wind.
export function createWind() {
  const uniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 1 },
    uWindDirection: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  };
  return {
    uniforms,
    update(time) { uniforms.uWindTime.value = time; },
  };
}
