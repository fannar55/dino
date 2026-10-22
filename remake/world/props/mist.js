// Low mist over the Fen's water: a few soft cards, never a full-screen fog pass (the look's fog stays as it is). The sun
// lifts it as the chapter goes on (setLevel, 1 at the arrival to 0.25 by the lookout).
//
//   createMist(world, { center: [x, z], radius, height = 1.2, level = 1, heightAt, over, seed }) ->
//     { group, setLevel(v), level, update(t), dispose() }
//
// At most CARDS cards stand within `radius` of `center`: on the points of `over` when it is given (the open water,
// forest.js), spread apart, else anywhere on the disc. Each is turned to the camera about the upright (a wisp of mist seen
// side on), lower than `height`: thickest 0.1 to 0.35 m over the water, thinning to nothing at its top, its sides and its
// foot, which is sunk a little below the surface so no line shows. Its noise is stretched along the ground and drifts with the
// wind (followed as it is now), and each card sways a metre or two along it. Additive and light (the spec's #cfe0d6), so
// nothing needs sorting; a card fades out near the camera, so the camera can pass through, and beyond 40 m. It fades too as it
// is looked down on: a card stands upright, so from above it shows edge on, as a thin, flat streak of light, which from her head
// and from the top of the lift is all it would be. By how steeply the camera looks down past the card's top (the rise over the
// run, MIST_FADE.steep: whole up to 1 in 7.7, gone by 1 in 4.5), so from a child's height and the reveal's 3.8 m over her pool it
// is as it was, and from her head (11 m up) there is none, nor within 25 m of a camera 6 m up. mistStrength() is the same sum in
// code. One draw call. The clock is the game's (update(t)).
import * as THREE from 'three';
import { FEN } from '../forest/config.js';
import { createRng } from '../forest/random.js';
import { createNoiseTexture } from '../forest/materials.js';

export const CARDS = 12;
// Where a card fades (m from the camera, and the camera's rise over its run above the card's top): in near, out far, and out as
// it is looked down on.
export const MIST_FADE = { near: [2.5, 8], far: [40, 55], steep: [0.13, 0.22], top: 0.6 };
const glsl = n => n.toFixed(3);

const VERT = /* glsl */`
attribute vec4 aCard; // x: width (m), y: height (m), z: phase, w: strength
attribute vec2 aCorner; // x: -1 to 1 across, y: 0 at the foot to 1 at the top
uniform float uTime;
uniform vec2 uWind;
varying vec2 vUv;
varying float vStrength;
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 centre = position + vec3( uWind.x, 0.0, uWind.y ) * sin( uTime * 0.05 + aCard.z * 6.2831 ) * 1.6;
  vec3 toCam = cameraPosition - centre;
  vec2 level2 = normalize( vec2( toCam.x, toCam.z ) + 1e-4 );
  vec3 side = vec3( -level2.y, 0.0, level2.x );
  vec3 p = centre + side * aCorner.x * aCard.x * 0.5 + vec3( 0.0, aCorner.y * aCard.y, 0.0 );
  vUv = vec2( aCorner.x, aCorner.y );
  vWorld = p;
  // fade near the camera, far from it, and as the card is looked down on: the camera's rise above the card's top over its run
  float dist = length( cameraPosition - p );
  float steep = ( cameraPosition.y - centre.y - aCard.y * ${glsl(MIST_FADE.top)} ) / max( length( toCam.xz ), 0.1 );
  vStrength = aCard.w * smoothstep( ${glsl(MIST_FADE.near[0])}, ${glsl(MIST_FADE.near[1])}, dist ) * ( 1.0 - smoothstep( ${glsl(MIST_FADE.far[0])}, ${glsl(MIST_FADE.far[1])}, dist ) )
    * ( 1.0 - smoothstep( ${glsl(MIST_FADE.steep[0])}, ${glsl(MIST_FADE.steep[1])}, steep ) );
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uLevel;
uniform vec3 uColour;
uniform vec2 uWind;
uniform float uStretch;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vStrength;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  float across = 1.0 - vUv.x * vUv.x;
  float shape = across * across * smoothstep( 0.0, 0.14, vUv.y ) * ( 1.0 - smoothstep( 0.34, 1.0, vUv.y ) );
  vec2 q = vec2( ( vWorld.x + vWorld.z * 0.6 ) * uStretch, vWorld.y * 1.4 ) - uWind * uTime * 0.02;
  float n = texture2D( uNoise, q ).g * 0.65 + texture2D( uNoise, q * 2.3 + 0.37 ).b * 0.35;
  float a = shape * smoothstep( 0.25, 0.72, n ) * vStrength * uLevel;
  if ( a < 0.002 ) discard;
  gl_FragColor = vec4( uColour, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * How much of a card the camera sees, 0 to 1, as the shader has it (before the card's own strength and the mist's level): the card's
 * foot at `foot` (a Vector3) and `height` m tall, seen from `camera` (a Vector3), at its middle.
 */
export function mistStrength(camera, foot, height) {
  const run = Math.max(Math.hypot(camera.x - foot.x, camera.z - foot.z), 0.1);
  const dist = Math.hypot(run, camera.y - (foot.y + height * 0.5));
  const steep = (camera.y - foot.y - height * MIST_FADE.top) / run;
  return smoothstep(...MIST_FADE.near, dist) * (1 - smoothstep(...MIST_FADE.far, dist)) * (1 - smoothstep(...MIST_FADE.steep, steep));
}

export function createMist(world, { center, radius, height = 1.2, level = 1, heightAt = world.heightAt, over = null, seed = 1, cards = CARDS } = {}) {
  const count = Math.min(CARDS, Math.max(0, Math.round(cards)));
  const rng = createRng(seed, 'mist');
  const [cx, cz] = center;
  // where the cards stand: points of `over`, shuffled and taken when they are far enough from those already taken
  const spots = [];
  if (over?.length) {
    const pool = [...over];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (const apart of [5, 3, 0]) {
      for (const p of pool) {
        if (spots.length >= count) break;
        if (spots.every(s => Math.hypot(s[0] - p[0], s[1] - p[1]) >= apart)) spots.push(p);
      }
    }
  }
  const pos = [], card = [], corner = [], idx = [];
  for (let k = 0; k < count; k++) {
    let x, z;
    if (spots.length) {
      if (k >= spots.length) break;
      [x, z] = spots[k];
    } else {
      // spread over the disc, a little more toward its middle
      const a = (k / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const r = radius * Math.sqrt(rng.range(0.04, 1));
      x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
    }
    const y = heightAt(x, z) - 0.08; // the foot just under the surface
    // over water a little stronger; on dry ground (no `over`) fainter, so it never reads as a sheet of water that is not there
    const w = rng.range(5, 9), h = height * rng.range(0.6, 0.9), phase = rng.next(), strength = spots.length ? rng.range(0.3, 0.4) : rng.range(0.25, 0.32);
    const base = pos.length / 3;
    for (const [u, v] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) {
      pos.push(x, y, z);
      card.push(w, h, phase, strength);
      corner.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aCard', new THREE.Float32BufferAttribute(card, 4));
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  geometry.setIndex(idx);
  // the cards turn to the camera in the shader: bound them by their disc and their height
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, heightAt(cx, cz) + height, cz), radius + 8);
  const noise = createNoiseTexture((seed ^ 0x3a17) >>> 0);
  const wind = world.wind?.uniforms?.uWindDirection?.value;
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uLevel: { value: level },
    uColour: { value: new THREE.Color(FEN.mist) },
    uWind: { value: wind ? new THREE.Vector2(wind.x, wind.y) : new THREE.Vector2(1, 0) },
    uStretch: { value: spots.length ? 0.06 : 0.11 }, // wisps drawn out along the water, shorter on the ground
    uNoise: { value: noise },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  material.name = 'fen-mist';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Mist';
  mesh.renderOrder = 13;
  const group = new THREE.Group();
  group.name = 'Mist';
  group.add(mesh);
  const mist = {
    group, mesh, cards: pos.length / 12,
    get level() { return uniforms.uLevel.value; },
    /** How thick the mist is: 1 as it lies at the arrival, toward 0 as the sun lifts it (it is hidden at 0). */
    setLevel(v) {
      uniforms.uLevel.value = Math.max(0, v);
      mesh.visible = uniforms.uLevel.value > 0.001;
    },
    update(t) {
      uniforms.uTime.value = t;
      if (wind) uniforms.uWind.value.set(wind.x, wind.y); // the wind as it is now
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose(); material.dispose(); noise.dispose();
    },
  };
  mist.setLevel(level);
  return mist;
}
