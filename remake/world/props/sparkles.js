import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { seededRandom } from '../../engine/random.js';

// Sparkles: warm gold-white glints for the story's magic moments (the saddle popping onto Mosi, Egill
// floating up into it). A set of sparkles is one THREE.Points, so one draw call, and each glint is
// posed in the vertex shader from its age. The age moves on the game clock: world.effects
// (engine/effects.js, which main.js updates every frame) advances it, so sparkles pause with the game
// and land on the same frame in a capture. When its last glint has faded, the set takes itself out of
// the scene and its handle finishes. Additive, like the forest's motes, so nothing needs sorting.
//
// The machinery is not only for sparkles: glints() takes a look (the sparkles' own, SPARKLE_LOOK, is what it gives when none
// is asked for) and pollen.js is the same set of glints with another one. A look sets how a glint is drawn (the glow, its star,
// its twinkle, how it fades at the rim, how much its size varies, what blending) and how it flies (swirling, rising, drifting).
// SPARKLE_LOOK switches the flying parts off, so the sparkles move as they always have.

const GOLD = '#f2b630'; // star gold (STYLE.md section 10): warm against the sky and against Mosi's sage
const CORE = '#fff4d6'; // the white-gold heart of each glint, the clearing's motes' colour

const VERT = /* glsl */`
attribute float birth; // seconds after the set began that the glint appears
attribute vec4 seed; // xyz: the way it flies out, w: its twinkle
uniform float uTime; // seconds since the set began
uniform float uLife; // seconds a glint lasts
uniform float uSpread; // metres it flies out along its seed
uniform float uFall; // metres it sinks by the end of its life
uniform float uSize; // metres across
uniform float uPixelScale; // pixels a metre spans one metre from the camera
uniform float uSwirl; // radians the way out turns about the vertical over a life
uniform float uRise; // metres it rises by the end of its life
uniform vec2 uDrift; // metres it drifts along the ground by the end of its life
uniform float uTwinkle; // 1 for the twinkle, 0 for a steady light
uniform float uVary; // 1 for sizes between half and one and a half times uSize, 0 for all alike
varying float vLight;
#include <common>
#include <fog_pars_vertex>
void main() {
  float age = uTime - birth;
  float t = clamp( age / uLife, 0.0, 1.0 );
  float fly = 1.0 - ( 1.0 - t ) * ( 1.0 - t ) * ( 1.0 - t ); // fast out, then it hangs
  vec3 way = seed.xyz * uSpread * fly;
  float turn = uSwirl * t * ( 0.6 + 0.8 * seed.w ); // each at its own pace, so the cloud winds up into a spiral
  way.xz = vec2( cos( turn ) * way.x - sin( turn ) * way.z, sin( turn ) * way.x + cos( turn ) * way.z );
  vec3 p = position + way + vec3( uDrift.x * t * t, uRise * t * ( 0.55 + 0.9 * seed.w ) - uFall * t * t, uDrift.y * t * t );
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  float alive = step( 0.0, age ) * step( age, uLife );
  float twinkle = uTwinkle > 0.5 ? 0.62 + 0.38 * sin( 6.2831853 * ( seed.w + age * 2.6 ) ) : 1.0;
  vLight = alive * min( 1.0, t * 10.0 ) * ( 1.0 - t * t ) * twinkle;
  float grain = mix( 1.0, 0.5 + fract( seed.w * 7.31 ), uVary );
  gl_PointSize = alive * uSize * grain * uPixelScale / max( 0.2, -mvPosition.z ) * ( 0.45 + 0.55 * vLight );
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uColour;
uniform vec3 uCore;
uniform float uGlow; // how bright the soft glow is at its heart
uniform float uFalloff; // how fast the glow fades outward: the bigger, the tighter
uniform float uStar; // 1 for the little four-pointed star, 0 for none
uniform float uRim; // 1 fades the glow out before the edge of the point, for a speck that is round to its rim
varying float vLight;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot( q, q );
  // A soft glow and a little four-pointed star.
  float rays = ( max( 0.0, 1.0 - abs( q.x ) * 7.0 ) * max( 0.0, 1.0 - abs( q.y ) ) + max( 0.0, 1.0 - abs( q.y ) * 7.0 ) * max( 0.0, 1.0 - abs( q.x ) ) ) * uStar;
  float rim = 1.0 - uRim * smoothstep( 0.45, 1.0, r2 );
  float a = clamp( uGlow * exp( -r2 * uFalloff ) * rim + 0.9 * rays, 0.0, 1.0 ) * vLight;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( mix( uColour, uCore, clamp( exp( -r2 * 14.0 ) + 0.5 * rays, 0.0, 1.0 ) ), a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function needEffects(world, call) {
  if (!world?.scene || !world?.effects) {
    throw new Error(`${call} needs world.scene and world.effects (engine/effects.js), which main.js updates every frame`);
  }
}

// How the sparkles are drawn and fly: what glints() uses when it is not given a look. The shader's own settings (see VERT and FRAG),
// the blending, the colour of the heart of a glint, and how its way out leans: its height on the sphere of ways, spread over `span`
// from `floor`. swirl, rise and drift are 0: the sparkles fly out, hang and sink, as they always have.
export const SPARKLE_LOOK = {
  glow: 0.85, falloff: 5, star: 1, twinkle: 1, rim: 0, vary: 0,
  swirl: 0, rise: 0, drift: [0, 0],
  core: CORE, blending: THREE.AdditiveBlending, floor: -0.6, span: 1.6,
};

// A set of `count` glints in the scene: their positions to fill in, their birth times and the shader's
// uniforms. Seeded, so a capture shows the same sparkles every time.
export function glints(world, { count, life, spread, fall, size, colour, seed, look = {} }) {
  const how = { ...SPARKLE_LOOK, ...look };
  const random = seededRandom(seed);
  const position = new Float32Array(count * 3);
  const birth = new Float32Array(count);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // A way out on the sphere, leaning up, each with its own reach.
    const y = random() * how.span + how.floor;
    const turn = random() * Math.PI * 2;
    const across = Math.sqrt(Math.max(0, 1 - y * y));
    const reach = 0.45 + 0.55 * random();
    seeds.set([Math.cos(turn) * across * reach, y * reach, Math.sin(turn) * across * reach, random()], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('birth', new THREE.BufferAttribute(birth, 1));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uLife: { value: life },
    uSpread: { value: spread },
    uFall: { value: fall },
    uSize: { value: size },
    uPixelScale: { value: 800 },
    uColour: { value: new THREE.Color(colour) },
    uCore: { value: new THREE.Color(how.core) },
    uGlow: { value: how.glow },
    uFalloff: { value: how.falloff },
    uStar: { value: how.star },
    uRim: { value: how.rim },
    uTwinkle: { value: how.twinkle },
    uVary: { value: how.vary },
    uSwirl: { value: how.swirl },
    uRise: { value: how.rise },
    uDrift: { value: new THREE.Vector2(how.drift[0], how.drift[1]) },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    fog: true, transparent: true, depthWrite: false, blending: how.blending,
  });
  material.name = 'sparkles';
  const points = new THREE.Points(geometry, material);
  points.name = 'Sparkles';
  points.frustumCulled = false; // the glints fly out of any bounds taken at the start
  points.renderOrder = 12;
  const viewport = new THREE.Vector2();
  points.onBeforeRender = (renderer, scene, camera) => {
    renderer.getDrawingBufferSize(viewport);
    uniforms.uPixelScale.value = viewport.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  };
  world.scene.add(points);
  return {
    points, position, birth, uniforms,
    remove() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

// Runs a set of glints on world.effects until `end` seconds, then takes it away and finishes the handle.
export function run(world, set, end, label, step = () => {}) {
  const handle = new Handle(label);
  let age = 0;
  const effect = {
    update(dt) {
      if (handle.done) return false;
      age += dt;
      set.uniforms.uTime.value = age;
      step(age);
      if (age < end) return true;
      set.remove();
      handle.finish();
      return false;
    },
  };
  handle.onCancel = () => set.remove();
  world.effects.add(effect);
  return handle;
}

/**
 * A burst of `count` glints from `point` (a THREE.Vector3, or a point spec world.resolvePoint knows):
 * they pop out in the first quarter of `duration` seconds and have faded by its end. Returns a Handle.
 */
export function sparkleBurst(world, point, { count = 24, duration = 1, colour = GOLD, size = 0.16, spread = 0.7, seed = 'burst' } = {}) {
  needEffects(world, 'sparkleBurst');
  const at = point?.isVector3 ? point : world.resolvePoint(point, new THREE.Vector3());
  const set = glints(world, { count, life: 0.75 * duration, spread, fall: 0.15, size, colour, seed });
  for (let i = 0; i < count; i++) {
    set.position.set([at.x, at.y, at.z], i * 3);
    set.birth[i] = (i / count) * 0.25 * duration;
  }
  return run(world, set, duration, 'sparkle burst');
}

/**
 * A trail of glints left behind something that moves: `count` of them are born over `duration`
 * seconds, each where `follow()` (a function returning a THREE.Vector3) is at that moment, and each
 * fades over `life` seconds, sinking a little. Returns a Handle that finishes when the last has faded.
 */
export function sparkleTrail(world, follow, { duration = 2, count = 40, life = 0.8, colour = GOLD, size = 0.13, seed = 'trail' } = {}) {
  needEffects(world, 'sparkleTrail');
  const set = glints(world, { count, life, spread: 0.22, fall: 0.3, size, colour, seed });
  const random = seededRandom(`${seed} jitter`);
  let born = 0;
  const place = age => {
    let changed = false;
    while (born < count && (born / count) * duration <= age) {
      const p = follow();
      set.position.set([p.x + (random() - 0.5) * 0.12, p.y + (random() - 0.5) * 0.12, p.z + (random() - 0.5) * 0.12], born * 3);
      set.birth[born] = age; // born now, where it is now
      born++;
      changed = true;
    }
    if (changed) {
      set.points.geometry.attributes.position.needsUpdate = true;
      set.points.geometry.attributes.birth.needsUpdate = true;
    }
  };
  set.birth.fill(1e6); // none is alive before it is placed
  return run(world, set, duration + life, 'sparkle trail', place);
}
