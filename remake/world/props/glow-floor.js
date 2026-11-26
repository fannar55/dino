import * as THREE from 'three';
import { buildSmallBloom } from './glow-flower.js';
import { FLOOR } from '../../chapters/hatid-route.js';

// A dance floor of glow flowers (the festival's party, spec 6: "glóblómin springa út yfir allan toppinn í bylgju og lýsast upp
// undir hverju fótspori"): the glow flower's own bloom (glow-flower.js buildSmallBloom: its petals, its colours, 15 triangles),
// small and many, in one instanced mesh and one draw call. A flower is a bud until the wave of `open` has passed it, then springs
// open (a little past open and back); the light of the open ones is one common pulse plus a pool under each foot. Everything is
// uniforms: set() writes nothing a flower at a time, so a frame of the party costs the same whatever it does.
//
//   const floor = createGlowFloor(world, { count, radius, heightAt, keep: [{ at: [x, z], r }], seed, from: [x, z], size });
//                 (from: where the wave of `open` starts, [0, 0] the middle as made; size: the blooms' size, FLOOR_LOOK.size as made)
//   floor.set({ open: 12, pulse: 0.6, colour: '#ff5fd2', steps: [[x, z, radius, level], ...] });
//   floor.flower(i) -> { at: [x, y, z], open: 0..1, light }   (what the shader draws for flower i: for a test)
//   floor.spots     -> [[x, y, z], ...]                       (where each stands)
//   floor.dispose();
//
// Not lit by the scene (no light, no shadow): the floor gives its own light, as the stage's lights do. Its own colours show dim
// (REST) under no light; a light brightens them and adds `colour` on the petals. Fog as everything else.

export const FLOOR_LOOK = {
  size: 1.7, // times the glow flower's own bloom (0.26 m across): about 0.45 m, a few pixels each in the wide shot
  spread: [0.85, 1.15], // each flower's own size, times `size`
  band: 1.5, // metres over which the wave opens a flower: within `open - band` of the middle all are open
  rest: 0.32, // how much of its own colour a flower shows under no light
  own: 0.55, // and how much more of it a light of 1 brings
  tint: 1.1, // how much of `colour` a light of 1 adds on a petal
  bud: 0.3, // the share of the light a bud gives
  steps: 16,
  lift: 0.03, // metres over the ground
};

const VERT = /* glsl */`
attribute vec3 aBud;
attribute float aPart;
attribute vec4 aSpot; // x, y, z (the ground), yaw
attribute float aSize;
uniform float uOpen;
uniform vec2 uFrom; // where the wave of open starts
uniform float uBand;
uniform float uPulse;
uniform float uBudShare;
uniform vec4 uSteps[${FLOOR_LOOK.steps}]; // x, z, radius, level
varying vec3 vColour;
varying float vLight;
varying float vPart;
#include <common>
#include <fog_pars_vertex>
void main() {
  float d = distance( aSpot.xz, uFrom );
  float o = clamp( ( uOpen - d ) / uBand, 0.0, 1.0 );
  // springs open: a little past open, and back (ease out with an overshoot)
  float k = o - 1.0;
  float spring = 1.0 + 2.70158 * k * k * k + 1.70158 * k * k;
  vec3 p = mix( aBud, position, spring ) * aSize;
  float c = cos( aSpot.w ), s = sin( aSpot.w );
  vec3 w = vec3( p.x * c - p.z * s, p.y, p.x * s + p.z * c ) + aSpot.xyz;
  float steps = 0.0;
  for ( int i = 0; i < ${FLOOR_LOOK.steps}; i++ ) {
    vec4 st = uSteps[ i ];
    steps += st.w * ( 1.0 - smoothstep( 0.5 * st.z, st.z, distance( aSpot.xz, st.xy ) ) );
  }
  vLight = ( uPulse + steps ) * mix( uBudShare, 1.0, o );
  vColour = color;
  vPart = aPart;
  vec4 mvPosition = viewMatrix * vec4( w, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uColour;
varying vec3 vColour;
varying float vLight;
varying float vPart;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 rgb = vColour * ( ${FLOOR_LOOK.rest.toFixed(3)} + ${FLOOR_LOOK.own.toFixed(3)} * vLight ) + uColour * ( vLight * vPart * ${FLOOR_LOOK.tint.toFixed(3)} );
  gl_FragColor = vec4( rgb, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// A small seeded random (mulberry32): the same seed, the same floor.
function seeded(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** `count` places within `radius` of the middle, evenly (a sunflower's spiral, jittered), none in a `keep` disc. */
function placeFlowers(count, radius, keep, random) {
  const kept = (x, z) => keep.some(k => {
    const [kx, kz] = k.at ?? k;
    return Math.hypot(x - kx, z - kz) < (k.r ?? k[2]);
  });
  let n = count;
  for (let tries = 0; tries < 40; tries++) {
    const jitter = seeded(Math.floor(random() * 1e9));
    const spacing = radius * Math.sqrt(Math.PI / n); // about the distance between neighbours
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = radius * Math.sqrt((i + 0.5) / n);
      const a = i * GOLDEN;
      let x = Math.cos(a) * r + (jitter() - 0.5) * spacing * 0.5;
      let z = Math.sin(a) * r + (jitter() - 0.5) * spacing * 0.5;
      const d = Math.hypot(x, z);
      if (d > radius) { x *= radius / d; z *= radius / d; }
      if (!kept(x, z)) out.push([x, z]);
    }
    if (out.length >= count) return out.slice(0, count);
    n += count - out.length;
  }
  throw new Error(`A glow floor of ${count} flowers does not fit in ${radius} m outside its keep discs`);
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The floor: `count` flowers within `radius` m of the top's middle ([0, 0]), each on `heightAt(x, z)`, none inside a `keep` disc
 * ({ at: [x, z], r } or [x, z, r]: the stage's stones). In world.scene. As made: all buds, no light, `colour` white.
 */
export function createGlowFloor(world, { count = FLOOR.count, radius = FLOOR.radius, heightAt, keep = [], seed = 6, from = [0, 0], size: bloomSize = FLOOR_LOOK.size } = {}) {
  const groundAt = heightAt ?? world.heightAt ?? world.forest?.heightAt ?? (() => 0);
  if (!(count > 0) || !(radius > 0)) throw new TypeError(`A glow floor needs flowers and room: ${count} in ${radius} m`);
  const random = seeded(seed);
  const places = placeFlowers(count, radius, keep, random);
  const spots = places.map(([x, z]) => [x, groundAt(x, z) + FLOOR_LOOK.lift, z]);

  const bloom = buildSmallBloom(random);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = bloom.index;
  for (const key of ['position', 'aBud', 'color', 'aPart']) geometry.setAttribute(key, bloom.getAttribute(key));
  const spot = new Float32Array(count * 4), size = new Float32Array(count);
  spots.forEach(([x, y, z], i) => {
    spot.set([x, y, z, random() * Math.PI * 2], i * 4);
    size[i] = bloomSize * (FLOOR_LOOK.spread[0] + (FLOOR_LOOK.spread[1] - FLOOR_LOOK.spread[0]) * random());
  });
  geometry.setAttribute('aSpot', new THREE.InstancedBufferAttribute(spot, 4));
  geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  geometry.instanceCount = count;
  const high = Math.max(...spots.map(s => s[1])), low = Math.min(...spots.map(s => s[1]));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (high + low) / 2, 0), Math.hypot(radius + 1, high - low + 1));

  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uOpen: { value: 0 },
    uFrom: { value: new THREE.Vector2(from[0], from[1]) },
    uBand: { value: FLOOR_LOOK.band },
    uPulse: { value: 0 },
    uBudShare: { value: FLOOR_LOOK.bud },
    uColour: { value: new THREE.Color(1, 1, 1) },
    uSteps: { value: Array.from({ length: FLOOR_LOOK.steps }, () => new THREE.Vector4(0, 0, 1, 0)) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, vertexColors: true, fog: true, side: THREE.DoubleSide });
  material.name = 'glow floor';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Glow floor';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  world.scene?.add(mesh);

  function set({ open, pulse, colour, steps } = {}) {
    if (open !== undefined) uniforms.uOpen.value = Math.max(0, open);
    if (pulse !== undefined) uniforms.uPulse.value = Math.max(0, pulse);
    if (colour !== undefined) uniforms.uColour.value.set(colour);
    if (steps !== undefined) {
      uniforms.uSteps.value.forEach((v, k) => {
        const st = steps[k];
        if (st) v.set(st[0], st[1], Math.max(0.05, st[2]), Math.max(0, st[3]));
        else v.set(0, 0, 1, 0);
      });
    }
  }

  /** What the shader draws for flower `i`: how open it is (0 a bud, 1 open) and its light (the pulse and the pools under it). */
  function flower(i) {
    const [x, y, z] = spots[i];
    const d = Math.hypot(x - uniforms.uFrom.value.x, z - uniforms.uFrom.value.y);
    const open = Math.min(1, Math.max(0, (uniforms.uOpen.value - d) / uniforms.uBand.value));
    let steps = 0;
    for (const st of uniforms.uSteps.value) steps += st.w * (1 - smooth(0.5 * st.z, st.z, Math.hypot(x - st.x, z - st.y)));
    const light = (uniforms.uPulse.value + steps) * (FLOOR_LOOK.bud + (1 - FLOOR_LOOK.bud) * open);
    return { at: [x, y, z], open, light };
  }

  return {
    mesh, spots, set, flower,
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      bloom.dispose();
      material.dispose();
    },
  };
}
