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
// nothing needs sorting; a card fades out near the camera, so the camera can pass through, beyond 40 m, and when it is looked
// down on from above, where a card would show as a sheet. One draw call. The clock is the game's (update(t)).
import * as THREE from 'three';
import { FEN } from '../forest/config.js';
import { createRng } from '../forest/random.js';
import { createNoiseTexture } from '../forest/materials.js';

export const CARDS = 12;

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
  // fade near the camera, and when the card is looked down on from above
  float dist = length( cameraPosition - p );
  float down = abs( normalize( toCam ).y );
  vStrength = aCard.w * smoothstep( 2.5, 8.0, dist ) * ( 1.0 - smoothstep( 40.0, 55.0, dist ) ) * ( 1.0 - smoothstep( 0.35, 0.7, down ) );
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uLevel;
uniform vec3 uColour;
uniform vec2 uWind;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vStrength;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  float across = 1.0 - vUv.x * vUv.x;
  float shape = across * across * smoothstep( 0.0, 0.14, vUv.y ) * ( 1.0 - smoothstep( 0.34, 1.0, vUv.y ) );
  vec2 q = vec2( ( vWorld.x + vWorld.z * 0.6 ) * 0.06, vWorld.y * 1.4 ) - uWind * uTime * 0.02;
  float n = texture2D( uNoise, q ).g * 0.65 + texture2D( uNoise, q * 2.3 + 0.37 ).b * 0.35;
  float a = shape * smoothstep( 0.25, 0.72, n ) * vStrength * uLevel;
  if ( a < 0.002 ) discard;
  gl_FragColor = vec4( uColour, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

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
    const w = rng.range(5, 9), h = height * rng.range(0.6, 0.9), phase = rng.next(), strength = rng.range(0.45, 0.6);
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
