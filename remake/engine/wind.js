import * as THREE from 'three';
import { foldBeats } from './beat.js';

// Shared wind. Every swaying thing reads these uniforms (pass the objects themselves into
// ShaderMaterial.uniforms, never copies), so grass, leaves and particles move as one wind.
export function createWind() {
  const uniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 1 },
    uWindDirection: { value: new THREE.Vector2(0.8, 0.6).normalize() },
    uBeats: { value: 0 }, // the theme's beat count since its first strong beat, folded into [0, 4) (engine/beat.js: beatsAt)
    uDance: { value: new THREE.Vector3() }, // the strong beats' dance: x the nod, y the hop, z the squash (engine/beat.js: danceAt)
  };
  const held = (value, low, high) => (Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : 0);
  return {
    uniforms,
    update(time) { uniforms.uWindTime.value = time; },
    /** The beat count the forest sways by, smoothly and in time with the music: the trees crest once in four beats, the ferns and bushes once in two, the grass every beat. */
    setBeats(beats) { uniforms.uBeats.value = foldBeats(beats); },
    /** On the strong beats the flowers nod (0..1) and the mushrooms hop (0..1) and squash (-1 stretches, 1 flattens). */
    setDance({ nod, hop, squash }) { uniforms.uDance.value.set(held(nod, 0, 1), held(hop, 0, 1), held(squash, -1, 1)); },
  };
}
