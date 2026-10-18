import * as THREE from 'three';
import { foldBeats, NO_BEAT } from './beat.js';

// Shared wind. Every swaying thing reads these uniforms (pass the objects themselves into
// ShaderMaterial.uniforms, never copies), so grass, leaves and particles move as one wind.
export function createWind() {
  const uniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 1 },
    uWindDirection: { value: new THREE.Vector2(0.8, 0.6).normalize() },
    uBeats: { value: NO_BEAT }, // the forest's beat count, folded into [0, 4) (engine/beat.js: followBeat), or NO_BEAT until there is one
    uDance: { value: new THREE.Vector3() }, // the strong beats' dance: x the nod, y the hop, z the squash (engine/beat.js: danceOf)
  };
  const held = (value, low, high) => (Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : 0);
  return {
    uniforms,
    update(time) { uniforms.uWindTime.value = time; },
    /**
     * The beat count the forest sways by, smoothly and in time with the music: the trees crest once in four beats, the ferns and
     * bushes once in two, the grass every beat. Below 0 (NO_BEAT) or not a number: no beat, and every wave holds its middle.
     */
    setBeats(beats) { uniforms.uBeats.value = Number.isFinite(beats) && beats >= 0 ? foldBeats(beats) : NO_BEAT; },
    /** On the strong beats the flowers nod (0..1) and the mushrooms hop (0..1) and squash (-1 stretches, 1 flattens). */
    setDance({ nod, hop, squash }) { uniforms.uDance.value.set(held(nod, 0, 1), held(hop, 0, 1), held(squash, -1, 1)); },
  };
}
