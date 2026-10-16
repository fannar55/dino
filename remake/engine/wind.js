import * as THREE from 'three';

// Shared wind. Every swaying thing reads these uniforms (pass the objects themselves into
// ShaderMaterial.uniforms, never copies), so grass, leaves and particles move as one wind.
export function createWind() {
  const uniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 1 },
    uWindDirection: { value: new THREE.Vector2(0.8, 0.6).normalize() },
    uBeat: { value: 0 }, // the theme's pulse, 1 on the beat falling to 0 (engine/beat.js)
    uDance: { value: new THREE.Vector3() }, // the strong beats' dance: x the nod, y the hop, z the squash (engine/beat.js: danceAt)
  };
  const held = (value, low, high) => (Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : 0);
  return {
    uniforms,
    update(time) { uniforms.uWindTime.value = time; },
    /** The foliage leans a little further with the pulse, so it sways in time with the music. */
    setBeat(pulse) { uniforms.uBeat.value = Number.isFinite(pulse) ? Math.min(1, Math.max(0, pulse)) : 0; },
    /** On the strong beats the flowers nod (0..1) and the mushrooms hop (0..1) and squash (-1 stretches, 1 flattens). */
    setDance({ nod, hop, squash }) { uniforms.uDance.value.set(held(nod, 0, 1), held(hop, 0, 1), held(squash, -1, 1)); },
  };
}
