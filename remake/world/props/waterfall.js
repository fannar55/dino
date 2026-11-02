// A waterfall: a river falling from its lip to a pool in front of its cliff (chapter 4's falls in Árdalurinn: spec 3 and 9).
//
//   const falls = createWaterfall(world, { top: [x, y, z], bottom: [x, y, z], width = 14, seed, out });
//   falls.update(t, sunDir)    each frame: the game's clock (s) and the direction toward the sun (world.lighting.direction if left out)
//   falls.sprayLevel(point)    how thick the spray is there: 1 at the foot of the falls, 0 SPRAY_REACH m from it
//   falls.curtainAt(y)         where the falling water is at height y, along `out` (its x, for falls that face east)
//
// `top` is the middle of the lip, at the river's level; `bottom` the middle of the foot, at the pool's. `out` is the way the water leaves
// the lip (level); left out it is from top to bottom, or east (+x) when one is straight under the other.
//
// Five draw calls and under 1k triangles:
// - The falling water: one ribbon from the river over the lip to under the pool's surface. It leaves the lip at OUT_SPEED and falls freely,
//   so it bows out from the cliff, and its shader carries streaks and foam down with the water itself: the pattern is laid out in the time
//   since the water left the lip, so it stretches as the water speeds up, and it whitens the further it has fallen.
// - The spray: two sets of glints (world/props/sparkles.js), white mist that veils what is behind it (normal blending: all one colour,
//   so their order does not matter), on a loop of PERIOD s: a cloud boiling up from the foot and drifting
//   downstream, and spray rising along the face on the falls' own draught, up past the lip and rolling back over it, so she bursts out of
//   it at the top (spec 5E). Where the cliff's shadow ends (a plane through the lip along the sun) the sun lights it warm; in the shadow it
//   is a dim grey-white. Looking toward the sun through it, it glows (spray.gain), and that glow eases, so a cut never makes it jump.
// - The rainbow: a card in the sunlit spray by the lip, turned to the camera, on which the bow is drawn where it truly is, 40 to 42 degrees
//   from the point straight away from the sun, red outside, only in sunlit spray. It shows only while the sun is behind the camera, within
//   RAINBOW.gone degrees of the way it looks (rainbowLevel), and fades in and out over RAINBOW.fade s, so it never pops.
// - The foam: rings of white water spreading from the foot over the pool.
// Nothing flashes (spec 5): no glint twinkles, and every light that follows the camera eases. A jump of the clock (a seek) sets them at once.
import * as THREE from 'three';
import { glints } from './sparkles.js';
import { seededRandom } from '../../engine/random.js';

/** Metres from the foot of the falls at which the spray is gone. */
export const SPRAY_REACH = 30;
/** The rainbow: whole up to `full` degrees between the view and straight away from the sun, gone by `gone`; `fade` s for a whole fade. */
export const RAINBOW = { full: 40, gone: 50, fade: 0.8 };
/** Seconds the spray's glints take to loop. */
export const PERIOD = 4;

const G = 9.81;
const OUT_SPEED = 1.2; // m/s the water leaves the lip with
const LIP_GAP = 0.3; // m in front of the face where it leaves the lip
const SPREAD = 0.12; // it widens by this share of its width on the way down
const ROWS = 30; // rows of the ribbon from the lip to the pool, even in time
const COLS = 14;
const AMBIENT = 1.15; // the sky's light on the water and the foam, against the hemisphere light (the rock also has the environment's)
const WATER_SKY = 1.9; // and how much more of it the falling water gives back: white water scatters the whole sky's light
const GAIN = { max: 1.9, power: 6, rate: 1.2 }; // the spray's glow looking into the sun, how tight round it, and its change a second
const JUMP = 0.25; // s: a longer step of the clock is a seek, not a frame

const VIEW = new THREE.Vector3();

/** How much of the rainbow shows (0 to 1) looking along `view` with the sun toward `sunDir`. */
export function rainbowLevel(view, sunDir) {
  if (sunDir.y <= 0) return 0;
  const cos = -(view.x * sunDir.x + view.y * sunDir.y + view.z * sunDir.z) / (Math.hypot(view.x, view.y, view.z) * Math.hypot(sunDir.x, sunDir.y, sunDir.z));
  const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(cos, -1, 1)));
  const k = THREE.MathUtils.clamp((RAINBOW.gone - angle) / (RAINBOW.gone - RAINBOW.full), 0, 1);
  return k * k * (3 - 2 * k);
}

const NOISE = /* glsl */`
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float noise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}`;

// the lights every part shares: the sun's direction and colour, the sky's and the ground's, the cliff's shadow as a plane
const LIGHT_PARS = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec4 uShade;`;

const CURTAIN_VERT = /* glsl */`
attribute float aTau; // seconds since the water left the lip (less than 0 on the river before it)
attribute float aAcross; // 0 to 1 across
attribute float aFall; // metres it has fallen
varying float vTau;
varying float vAcross;
varying float vFall;
varying vec3 vWorld;
varying vec3 vNormal;
#include <common>
#include <fog_pars_vertex>
void main() {
  vTau = aTau; vAcross = aAcross; vFall = aFall;
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  vNormal = normalize( mat3( modelMatrix ) * normal );
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CURTAIN_FRAG = /* glsl */`
uniform float uTime;
uniform float uHeight;
${LIGHT_PARS}
varying float vTau;
varying float vAcross;
varying float vFall;
varying vec3 vWorld;
varying vec3 vNormal;
#include <common>
#include <fog_pars_fragment>
${NOISE}
void main() {
  float flow = vTau - uTime; // the same on a parcel of water all the way down: the pattern falls with it
  float x = vAcross * 16.0;
  float clump = noise( vec2( vAcross * 6.0, flow * 0.8 ) );
  float body = noise( vec2( x, flow * 2.2 ) ) * 0.55 + noise( vec2( x * 2.3 + 5.0, flow * 4.6 ) ) * 0.45;
  float streak = noise( vec2( vAcross * 48.0, flow * 0.7 ) );
  float drop = clamp( vFall / uHeight, 0.0, 1.0 );
  float foam = smoothstep( 0.3, 0.8, body * 0.5 + streak * 0.3 + clump * 0.35 + drop * 0.45 );
  vec3 albedo = mix( vec3( 0.46, 0.64, 0.69 ), vec3( 1.0 ), foam );
  // ragged edges, a little clearer where it is torn; in from the river at the lip, out into the pool
  float edge = min( vAcross, 1.0 - vAcross );
  float rag = noise( vec2( flow * 1.7, vAcross * 4.0 + 13.0 ) );
  float a = smoothstep( 0.0, 0.08 + 0.14 * rag, edge ) * mix( 0.8, 1.0, foam );
  a *= smoothstep( -0.45, -0.05, vTau );
  a *= 1.0 - smoothstep( uHeight - 1.5, uHeight + 0.3, vFall );
  // the sky (white water in shade is still bright: it scatters the sky's light), the sun where the cliff's shadow does not reach,
  // and its glow through the thin water
  vec3 n = normalize( gl_FrontFacing ? vNormal : -vNormal );
  float lit = smoothstep( -0.8, 0.8, dot( uShade.xyz, vWorld ) + uShade.w );
  vec3 colour = albedo * ( mix( uGround, uSky, 0.6 + 0.4 * n.y ) * ${WATER_SKY.toFixed(2)} + uSun * max( dot( n, uSunDir ), 0.0 ) * lit );
  vec3 view = normalize( vWorld - cameraPosition );
  colour += uSun * pow( max( dot( view, uSunDir ), 0.0 ), 6.0 ) * lit * ( 1.0 - foam * 0.6 ) * 0.3;
  gl_FragColor = vec4( colour, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// a flat card (the foam) or one turned to the camera (the rainbow): world position for the fragment
const CARD_VERT = /* glsl */`
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// where the falls are, for the foam's rings and the rainbow's spray
const FALLS_PARS = /* glsl */`
uniform vec3 uLip; // the middle of the lip
uniform vec3 uOut; // the way the water leaves it (level)
uniform vec3 uAcross; // across the falls (level)
uniform float uHeight; // metres from the lip to the pool
uniform float uWidth; // metres across the water at the foot
uniform float uFoot; // metres out from the face at which the water meets the pool`;

const FOAM_FRAG = /* glsl */`
uniform float uTime;
${LIGHT_PARS}
${FALLS_PARS}
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec3 d = vWorld - uLip;
  float along = dot( d, uOut );
  if ( along < 0.2 ) discard; // under the cliff
  float side = max( abs( dot( d, uAcross ) ) - uWidth * 0.5, 0.0 );
  float r = length( vec2( along - uFoot, side ) ); // from the line where the water meets the pool
  vec2 q = vec2( along, dot( d, uAcross ) );
  float mottle = noise( q * 0.6 + vec2( -uTime * 0.35, 0.0 ) ) * 0.6 + noise( q * 1.7 + vec2( 3.0, uTime * 0.2 ) ) * 0.4;
  float rings = 0.5 + 0.5 * sin( r * 1.3 - uTime * 2.1 + mottle * 3.0 );
  float foam = ( 1.0 - smoothstep( 1.5, 15.0, r ) ) * smoothstep( 0.25, 0.7, mottle * 0.7 + rings * 0.45 + ( 1.0 - smoothstep( 0.0, 5.0, r ) ) * 0.5 );
  if ( foam < 0.01 ) discard;
  vec3 colour = vec3( 0.93, 0.96, 0.96 ) * ( mix( uGround, uSky, 0.9 ) + uSun * max( uSunDir.y, 0.0 ) * smoothstep( -0.8, 0.8, dot( uShade.xyz, vWorld ) + uShade.w ) );
  gl_FragColor = vec4( colour, foam * 0.85 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const RAINBOW_FRAG = /* glsl */`
uniform float uLevel;
${LIGHT_PARS}
${FALLS_PARS}
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float band( float a, float centre, float width ) { float k = ( a - centre ) / width; return exp( -k * k ); }
// how thick the spray is here: up along the face and over the lip
float sprayAt( vec3 p ) {
  vec3 d = p - uLip;
  float along = dot( d, uOut );
  float side = abs( dot( d, uAcross ) );
  float column = ( 1.0 - smoothstep( 4.0, 12.0, abs( along - 3.0 ) ) ) * smoothstep( -uHeight, -uHeight + 6.0, d.y ) * ( 1.0 - smoothstep( 6.0, 16.0, d.y ) );
  return column * ( 1.0 - smoothstep( uWidth * 0.5, uWidth * 0.5 + 8.0, side ) );
}
void main() {
  vec3 ray = normalize( vWorld - cameraPosition );
  float angle = degrees( acos( clamp( dot( ray, -uSunDir ), -1.0, 1.0 ) ) );
  vec3 colour = vec3( 1.0, 0.16, 0.10 ) * band( angle, 42.0, 0.55 ) + vec3( 1.0, 0.52, 0.08 ) * band( angle, 41.5, 0.5 )
    + vec3( 0.95, 0.9, 0.2 ) * band( angle, 41.1, 0.45 ) + vec3( 0.2, 0.85, 0.3 ) * band( angle, 40.7, 0.45 )
    + vec3( 0.15, 0.4, 1.0 ) * band( angle, 40.35, 0.45 ) + vec3( 0.45, 0.25, 0.95 ) * band( angle, 40.0, 0.4 );
  float lit = smoothstep( -0.8, 0.8, dot( uShade.xyz, vWorld ) + uShade.w );
  float a = uLevel * sprayAt( vWorld ) * lit * smoothstep( 6.0, 14.0, length( cameraPosition - vWorld ) ) * 0.55;
  #if defined( USE_FOG ) && defined( FOG_EXP2 )
    // additive: the haze takes its light away rather than mixing in its own colour (engine/fog.js's sum)
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = max( length( fogRay ), 1e-4 );
    vec3 fogDir = fogRay / fogDist;
    float fogBase = fogDensity * exp( -FOG_FALLOFF * max( cameraPosition.y, 0.0 ) );
    float fogPath = abs( fogDir.y ) > 1e-3 ? ( 1.0 - exp( -FOG_FALLOFF * fogRay.y ) ) / ( FOG_FALLOFF * fogDir.y ) : fogDist;
    a *= exp( -max( fogBase * fogPath, 0.0 ) );
  #endif
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( colour, a );
  #include <colorspace_fragment>
}`;

/** Build the waterfall and put it in world.scene. */
export function createWaterfall(world, { top, bottom, width = 14, seed = 1, out: outSpec = null } = {}) {
  const lip = new THREE.Vector3(...top);
  const foot = new THREE.Vector3(...bottom);
  const height = lip.y - foot.y;
  const out = new THREE.Vector3(...(outSpec ?? [foot.x - lip.x, 0, foot.z - lip.z])).setY(0);
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  out.normalize();
  const across = new THREE.Vector3(-out.z, 0, out.x);
  const up = new THREE.Vector3(0, 1, 0);
  const fallTime = Math.sqrt((2 * height) / G);
  const outAt = fall => LIP_GAP + OUT_SPEED * Math.sqrt((2 * Math.max(fall, 0)) / G);
  const widthAt = fall => width * (1 + SPREAD * THREE.MathUtils.clamp(fall / height, 0, 1));
  const faceAt = lip.dot(out);
  /** The foot: where the middle of the water meets the pool. */
  const base = new THREE.Vector3().copy(lip).addScaledVector(out, outAt(height)).setY(foot.y);

  const group = new THREE.Group();
  group.name = 'Waterfall';
  world.scene.add(group);

  // the lights, shared by every part (update keeps them up with the scene's)
  const light = {
    sunDir: new THREE.Vector3(0, 1, 0), sun: new THREE.Color(1, 1, 1), sky: new THREE.Color(0.6, 0.65, 0.7), ground: new THREE.Color(0.3, 0.3, 0.25),
    shade: new THREE.Vector4(0, 1, 0, 1e6),
  };
  const lightUniforms = () => ({
    uSunDir: { value: light.sunDir }, uSun: { value: light.sun }, uSky: { value: light.sky }, uGround: { value: light.ground }, uShade: { value: light.shade },
  });
  const fallsUniforms = () => ({
    uLip: { value: lip }, uOut: { value: out }, uAcross: { value: across }, uHeight: { value: height }, uWidth: { value: widthAt(height) },
    uFoot: { value: outAt(height) },
  });

  // The falling water: rows down the fall, even in time, after two on the river coming to the lip.
  const rows = [
    { tau: -0.4, along: -0.8, y: lip.y + 0.03, fall: 0 },
    { tau: -0.12, along: -0.15, y: lip.y + 0.02, fall: 0 },
  ];
  for (let k = 0; k <= ROWS; k++) {
    const tau = (fallTime + 0.06) * (k / ROWS); // a little past the pool's surface
    const fall = 0.5 * G * tau * tau;
    rows.push({ tau, along: outAt(fall), y: lip.y - fall, fall });
  }
  const count = rows.length * (COLS + 1);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const tauAt = new Float32Array(count);
  const acrossAt = new Float32Array(count);
  const fallAt = new Float32Array(count);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  rows.forEach((row, r) => {
    // square to the water's path: up where it runs level over the lip, out from the cliff once it falls
    n.copy(up).multiplyScalar(OUT_SPEED).addScaledVector(out, G * Math.max(row.tau, 0)).normalize();
    for (let c = 0; c <= COLS; c++) {
      const i = r * (COLS + 1) + c;
      const u = c / COLS;
      p.copy(lip).addScaledVector(out, row.along).addScaledVector(across, (u - 0.5) * widthAt(row.fall)).setY(row.y);
      p.toArray(position, i * 3);
      n.toArray(normal, i * 3);
      tauAt[i] = row.tau;
      acrossAt[i] = u;
      fallAt[i] = row.fall;
    }
  });
  const index = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = r * (COLS + 1) + c;
      const b = a + 1;
      const d = a + COLS + 1;
      index.push(a, b, d, b, d + 1, d); // wound so the front faces out from the cliff
    }
  }
  const curtainGeometry = new THREE.BufferGeometry();
  curtainGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  curtainGeometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  curtainGeometry.setAttribute('aTau', new THREE.BufferAttribute(tauAt, 1));
  curtainGeometry.setAttribute('aAcross', new THREE.BufferAttribute(acrossAt, 1));
  curtainGeometry.setAttribute('aFall', new THREE.BufferAttribute(fallAt, 1));
  curtainGeometry.setIndex(index);
  curtainGeometry.computeBoundingSphere();
  const curtainUniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...lightUniforms(),
    uTime: { value: 0 },
    uHeight: { value: height },
  };
  const curtain = new THREE.Mesh(curtainGeometry, new THREE.ShaderMaterial({
    vertexShader: CURTAIN_VERT, fragmentShader: CURTAIN_FRAG, uniforms: curtainUniforms,
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  curtain.name = 'Falling water';
  curtain.material.name = 'falling water';
  curtain.renderOrder = 2;
  group.add(curtain);

  // The spray: glints on a loop. Each is born at its time in the loop and again a loop earlier, so the one alive across the loop's
  // end flies on unbroken; births are spread evenly over the loop, so the cloud's light holds steady.
  const random = seededRandom(`${seed} falls`);
  const sprayLook = extra => ({
    glow: 0.15, falloff: 3, star: 0, twinkle: 0, rim: 1, vary: 1, core: '#ffffff', blending: THREE.NormalBlending,
    light: { dim: 0.8, shadeColour: '#d3dee0', soft: 3, near: [2, 6], maxSize: 400 }, ...extra,
  });
  function spray({ name, count: many, life, spread, fall, size, look, at, centre, radius }) {
    const set = glints(world, { count: many * 2, life, spread, fall, size, colour: '#fff3df', seed: `${seed} ${name}`, look: sprayLook(look) });
    const seeds = set.points.geometry.attributes.seed.array;
    for (let i = 0; i < many; i++) {
      at(p);
      p.toArray(set.position, i * 3);
      p.toArray(set.position, (many + i) * 3);
      set.birth[i] = ((i + random() * 0.9) / many) * PERIOD;
      set.birth[many + i] = set.birth[i] - PERIOD;
      for (let k = 0; k < 4; k++) seeds[(many + i) * 4 + k] = seeds[i * 4 + k];
    }
    set.points.removeFromParent();
    set.points.name = `Falls spray (${name})`;
    set.points.frustumCulled = true;
    set.points.geometry.boundingSphere = new THREE.Sphere(centre, radius);
    group.add(set.points);
    return set;
  }
  const footWidth = widthAt(height);
  const sets = [
    // boiling up from the foot and drifting downstream
    spray({
      name: 'foot', count: 220, life: 3.4, spread: 10, fall: 1, size: 4.5,
      look: { glow: 0.6, floor: 0, span: 0.8, rise: 9, swirl: 0.4, drift: [out.x * 7, out.z * 7] },
      at: v => v.copy(base).addScaledVector(across, (random() - 0.5) * footWidth * 1.05).addScaledVector(out, random() * 2.5 - 0.5).setY(foot.y + 0.4),
      centre: base.clone().addScaledVector(up, 8).addScaledVector(out, 6), radius: 26,
    }),
    // rising up the face on the falls' draught, past the lip and rolling back over it
    spray({
      name: 'face', count: 300, life: 3.6, spread: 3, fall: 0, size: 4,
      look: { glow: 0.85, floor: -0.3, span: 0.6, rise: 16, swirl: 0.3, drift: [-out.x * 18, -out.z * 18] },
      at: v => {
        const fall = height * 0.45 * random(); // the upper half: rising, it rolls over the lip round her (spec 5E)
        return v.copy(lip).addScaledVector(out, outAt(fall) + 1 + random() * 2).addScaledVector(across, (random() - 0.5) * widthAt(fall) * 1.2).setY(lip.y - fall);
      },
      centre: lip.clone().addScaledVector(up, 6).addScaledVector(out, -8), radius: 42,
    }),
  ];

  // The rainbow, on a card in the sunlit spray by the lip.
  const rainbowUniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...lightUniforms(), ...fallsUniforms(), uLevel: { value: 0 } };
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: CARD_VERT, fragmentShader: RAINBOW_FRAG, uniforms: rainbowUniforms,
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  card.name = 'Rainbow';
  card.material.name = 'rainbow';
  card.position.copy(lip).addScaledVector(out, 3).addScaledVector(up, -4);
  card.scale.set(56, 48, 1);
  card.renderOrder = 13;
  card.visible = false;
  group.add(card);

  // The foam on the pool, on a flat card from the face out past the rings.
  const foamUniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...lightUniforms(), ...fallsUniforms(), uTime: { value: 0 } };
  const foamLength = outAt(height) + 17;
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(foamLength, footWidth + 30).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    vertexShader: CARD_VERT, fragmentShader: FOAM_FRAG, uniforms: foamUniforms, fog: true, transparent: true, depthWrite: false,
  }));
  foam.name = 'Falls foam';
  foam.material.name = 'falls foam';
  foam.position.copy(lip).addScaledVector(out, foamLength / 2).setY(foot.y + 0.06);
  foam.rotation.y = Math.atan2(-out.z, out.x);
  foam.renderOrder = 1;
  group.add(foam);

  const footA = base.clone().addScaledVector(across, -footWidth / 2);
  const footLine = new THREE.Line3(footA, base.clone().addScaledVector(across, footWidth / 2));
  const closest = new THREE.Vector3();
  const rainbow = { mesh: card, level: 0 };
  const sprayState = { gain: 1, sets };
  let last = null;

  // The cliff's shadow: the plane through the lip's edge (along `across`) and the sun. Nothing is shaded when the sun is on the falls' side.
  function shadeFrom(sunDir) {
    if (sunDir.dot(out) >= 0 || sunDir.y <= 0) { light.shade.set(0, 1, 0, 1e6); return; }
    n.crossVectors(across, sunDir);
    if (n.y < 0) n.negate();
    if (n.lengthSq() < 1e-8) { light.shade.set(0, 1, 0, 1e6); return; }
    n.normalize();
    light.shade.set(n.x, n.y, n.z, -n.dot(lip));
  }

  function update(t, sunDir = world.lighting?.direction) {
    const jump = last === null || t < last || t - last > JUMP;
    const dt = jump ? 0 : t - last;
    last = t;
    const loop = ((t % PERIOD) + PERIOD) % PERIOD;
    for (const set of sets) set.uniforms.uTime.value = loop;
    curtainUniforms.uTime.value = t % 3600;
    foamUniforms.uTime.value = t % 3600;
    if (sunDir) {
      light.sunDir.copy(sunDir).normalize();
      shadeFrom(light.sunDir);
      for (const set of sets) set.uniforms.uShade.value.copy(light.shade);
    }
    const lighting = world.lighting;
    if (lighting?.sun) light.sun.copy(lighting.sun.color).multiplyScalar(lighting.sun.intensity / Math.PI);
    if (lighting?.hemi) {
      light.sky.copy(lighting.hemi.color).multiplyScalar(lighting.hemi.intensity * AMBIENT);
      light.ground.copy(lighting.hemi.groundColor).multiplyScalar(lighting.hemi.intensity * AMBIENT);
    }
    // what follows the camera, eased: the rainbow, the spray's glow toward the sun
    const camera = world.camera;
    let bow = 0;
    let glow = 1;
    if (camera) {
      camera.getWorldDirection(VIEW);
      bow = rainbowLevel(VIEW, light.sunDir);
      glow = 1 + (GAIN.max - 1) * Math.max(VIEW.dot(light.sunDir), 0) ** GAIN.power;
      card.quaternion.copy(camera.getWorldQuaternion(card.quaternion));
    }
    const ease = (from, to, rate) => (jump ? to : from + THREE.MathUtils.clamp(to - from, -rate * dt, rate * dt));
    rainbow.level = ease(rainbow.level, bow, 1 / RAINBOW.fade);
    rainbowUniforms.uLevel.value = rainbow.level;
    card.visible = rainbow.level > 1e-3;
    sprayState.gain = ease(sprayState.gain, glow, GAIN.rate);
    for (const set of sets) set.uniforms.uGain.value = sprayState.gain;
  }

  return {
    group, base, rainbow, spray: sprayState,
    /** The bounds of the whole falls, spray and all: { center, radius }. */
    sphere: { center: lip.clone().addScaledVector(up, -height / 2 + 4).addScaledVector(out, 4), radius: height / 2 + 26 },
    update,
    sprayLevel(point) {
      footLine.closestPointToPoint(point, true, closest);
      const k = THREE.MathUtils.clamp(closest.distanceTo(point) / SPRAY_REACH, 0, 1);
      return 1 - k * k * (3 - 2 * k);
    },
    curtainAt: y => faceAt + outAt(lip.y - y),
    dispose() {
      for (const set of sets) set.remove();
      for (const mesh of [curtain, card, foam]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      group.removeFromParent();
    },
  };
}
