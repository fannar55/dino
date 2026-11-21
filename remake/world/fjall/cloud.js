// The cloud on the mountain's side (chapter 6, scenes 4 to 6: "Þokan er ský"): white all round, thicker with every print counted, and
// blown away in a ring from her roar. The cloud is the engine's own fog (engine/fog.js), made thicker and whiter while the game runs:
// its density is a uniform every material reads each frame, so thickening it costs nothing, and the chapter eases the light to
// LOOKS.inCloud (engine/light-blend.js), so the fog and the sky are one white and nothing shows where they meet. Cards carry only what
// moves (the mist's shader, world/props/mist.js, white and normal-blended, one draw call): wisps drifting round the camera, the swirl
// where a tap finds nothing, the wisps that lift off a counted print, and the ring that flies out from her as the cloud blows away;
// and the golden glow where her roar comes from is one soft disc that takes no fog (a second draw call).
//
//   const cloud = createCloud(world, { centre, radius, heightAt, seed, reduced })
//   cloud.setLevel(level, seconds = CLOUD.ease)   0 (thin: about 115 m seen) to 1 (thick: about 13 m), eased on the game clock
//   cloud.liftAt(point, radius = 5)               the cloud lifts off a counted print: wisps rise and part there, the white thins a little
//   cloud.swirlAt(point)                          a tap on nothing: the cloud swirls there (reduced: it brightens there, still)
//   cloud.glow(point | null, strength)            the golden glow in the cloud toward `point` (null: it fades)
//   cloud.blowAway({ from, seconds = CLOUD.blow }) -> Handle: a ring of cloud flies out from `from` as the density eases down to the
//                                                 sunset's clear air (LOOKS.sunset) and the level to 0 (reduced: the ring only fades)
//   cloud.update(dt, time)                        every frame (the place's update); nothing changes without it
//   cloud.dispose()                               the fog back as the look had it (world.lightLook, else world.look)
//
// From its first setLevel the cloud holds the fog's density (scene.fog.userData.heldBy): a look eased meanwhile sets the fog's colour
// only. It lets go when the ring has blown it away, and at dispose.
import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { LOOKS } from '../../engine/looks.js';
import { createRng } from '../forest/random.js';
import { createNoiseTexture } from '../forest/materials.js';

export const CLOUD = { density: [0.02, 0.17], colour: '#f1f3f0', ease: 2.5, blow: 3 };
const POOL = 64; // cards at most
const DRIFT = 14; // the wisps round the camera
const RING = 24; // the ring her roar blows out
// The wisps round the camera: within `box` m of it (wrapped as it moves), fading in from `near` m; their strength at level 1.
const AROUND = { box: 22, near: [1.5, 5], strength: 0.42 };
const LIFT = { cards: 6, seconds: 2.2, dip: 0.35, dipSeconds: 2.4 }; // dip: how much thinner the white gets, at most
const SWIRL = { cards: 5, seconds: 1.8, turn: 2.2 };
const GLOW = { colour: '#ffcf80', size: 30, alpha: 0.55, rate: 1.25 }; // rate: strength a second

/** The fog's density at a level of the cloud: 0 sees about 115 m (to nine tenths white), 1 about 13 m. */
export function densityAt(level) {
  const k = Math.min(1, Math.max(0, level));
  return CLOUD.density[0] + (CLOUD.density[1] - CLOUD.density[0]) * k;
}

const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const easeOut = x => { const k = Math.min(1, Math.max(0, x)); return 1 - (1 - k) * (1 - k); };
/** A point's x and z: a Vector3 (or { x, z }), [x, z] or [x, y, z]. */
const xz = p => (Array.isArray(p) ? (p.length === 2 ? [p[0], p[1]] : [p[0], p[2]]) : [p.x, p.z]);
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

const VERT = /* glsl */`
attribute vec3 aCentre;
attribute vec2 aCorner;
attribute vec4 aCard; // x: width (m), y: height (m), z: opacity, w: seed
attribute float aBright;
uniform vec2 uNear;
varying vec2 vUv;
varying float vOpacity;
varying float vSeed;
varying float vBright;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = viewMatrix * vec4( aCentre, 1.0 );
  float dist = -mvPosition.z;
  mvPosition.xy += aCorner * aCard.xy * 0.5; // turned to the camera
  vUv = aCorner;
  vOpacity = aCard.z * smoothstep( uNear.x, uNear.y, dist ); // the camera passes through a card, never a sheet
  vSeed = aCard.w;
  vBright = aBright;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uBright;
uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vOpacity;
varying float vSeed;
varying float vBright;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 q = vUv * 0.5 + 0.5;
  vec2 drift = vec2( uTime * 0.012, uTime * 0.004 );
  float n = texture2D( uNoise, q * 0.55 + vSeed * 0.37 + drift ).g * 0.6 + texture2D( uNoise, q * 1.3 + vSeed * 0.71 - drift ).b * 0.4;
  float r = length( vUv ) + ( n - 0.5 ) * 0.6;
  float a = vOpacity * ( 1.0 - smoothstep( 0.25, 1.0, r ) ) * ( 0.55 + 0.45 * n );
  if ( a < 0.003 ) discard;
  vec3 colour = mix( uShade, uLit, clamp( 0.5 + vUv.y * 0.35 + ( n - 0.5 ) * 0.5, 0.0, 1.0 ) );
  colour = mix( colour, uBright, vBright );
  gl_FragColor = vec4( colour, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const GLOW_VERT = /* glsl */`
uniform vec3 uCentre;
uniform float uSize;
varying vec2 vUv;
void main() {
  vec4 mvPosition = viewMatrix * vec4( uCentre, 1.0 );
  mvPosition.xy += position.xy * uSize * 0.5;
  vUv = position.xy;
  gl_Position = projectionMatrix * mvPosition;
}`;

const GLOW_FRAG = /* glsl */`
uniform vec3 uColour;
uniform float uLevel;
varying vec2 vUv;
void main() {
  float d = dot( vUv, vUv );
  float a = uLevel * ( exp( -d * 3.2 ) - 0.04 );
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColour, a );
  #include <colorspace_fragment>
}`;

export function createCloud(world, { centre = [0, 0], radius = 60, heightAt = world.heightAt, seed = 6, reduced = false } = {}) {
  const ground = (x, z) => (heightAt ? heightAt(x, z) : 0);
  const fog = world.scene?.fog ?? null;
  const rng = createRng(seed, 'cloud');

  // ---- the cards: one mesh of quads, placed on the CPU each frame (POOL * 4 vertices) ----
  const cards = Array.from({ length: POOL }, (_, k) => ({
    k, kind: null, alive: false, x: 0, y: 0, z: 0, w: 1, h: 1, opacity: 0, bright: 0, age: 0, life: 0, seed: rng.range(0, 10),
  }));
  const centres = new Float32Array(POOL * 12), data = new Float32Array(POOL * 16), bright = new Float32Array(POOL * 4);
  const corners = [], index = [];
  for (let k = 0; k < POOL; k++) {
    corners.push(-1, -1, 1, -1, 1, 1, -1, 1);
    index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  const centreAttr = new THREE.BufferAttribute(centres, 3).setUsage(THREE.DynamicDrawUsage);
  const cardAttr = new THREE.BufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage);
  const brightAttr = new THREE.BufferAttribute(bright, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', centreAttr); // three needs one; the shader places the corners
  geometry.setAttribute('aCentre', centreAttr);
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute('aCard', cardAttr);
  geometry.setAttribute('aBright', brightAttr);
  geometry.setIndex(index);
  const noise = createNoiseTexture((seed ^ 0x51c7) >>> 0);
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uLit: { value: new THREE.Color('#ffffff') },
    uShade: { value: new THREE.Color('#d9dfdb') },
    uBright: { value: new THREE.Color('#fff1cf') },
    uNear: { value: new THREE.Vector2(...AROUND.near) },
    uTime: { value: 0 },
    uNoise: { value: noise },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms, fog: true, transparent: true, depthWrite: false,
  });
  material.name = 'fjall-cloud';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Cloud cards';
  mesh.frustumCulled = false; // turned and moved in the shader and each frame: always drawn while any card lives
  mesh.renderOrder = 14;
  mesh.visible = false;

  // ---- the golden glow: one disc turned to the camera, no fog (it shines through the white) ----
  const glowUniforms = {
    uCentre: { value: new THREE.Vector3() }, uSize: { value: GLOW.size }, uColour: { value: new THREE.Color(GLOW.colour) }, uLevel: { value: 0 },
  };
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  glowGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const glowMaterial = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: glowUniforms, transparent: true, depthWrite: false, fog: false,
  });
  glowMaterial.name = 'fjall-cloud-glow';
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.name = 'Cloud glow';
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 15;
  glowMesh.visible = false;

  const group = new THREE.Group();
  group.name = 'Cloud';
  group.add(mesh, glowMesh);

  // ---- the level and the fog ----
  let level = 0;
  let ease = null; // { from, to, age, seconds }
  let held = false;
  let heldDensity = densityAt(0);
  let dip = null; // { age }: the white thinning over a counted print
  let blow = null; // { age, seconds, level, density, handle }
  let glowLevel = 0, glowTo = 0;
  let time = 0;

  const hold = () => {
    if (!fog) return;
    held = true;
    fog.userData ??= {}; // (a Fog is no Object3D: it has none of its own)
    fog.userData.heldBy = cloud;
  };
  const letGo = () => {
    held = false;
    if (fog?.userData?.heldBy === cloud) fog.userData.heldBy = null;
  };
  const dipNow = () => (dip ? LIFT.dip * bump(dip.age / LIFT.dipSeconds) : 0);
  const writeFog = () => { if (held && fog) fog.density = heldDensity * (1 - dipNow()); };

  function spawn(kind, at) {
    const card = cards.find(c => !c.alive);
    if (!card) return null;
    Object.assign(card, { kind, alive: true, age: 0, bright: 0, opacity: 0, vx: 0, vy: 0, vz: 0 }, at);
    return card;
  }

  // the wisps round the camera, placed once round the cloud's centre and wrapped round the camera as it goes
  for (let i = 0; i < DRIFT; i++) {
    const x = centre[0] + rng.range(-AROUND.box, AROUND.box), z = centre[1] + rng.range(-AROUND.box, AROUND.box);
    spawn('drift', { x, z, y: ground(x, z) + rng.range(0.6, 3.5), w: rng.range(6, 11), h: rng.range(3, 5.5), life: Infinity, vx: rng.range(0.25, 0.5), vz: rng.range(-0.15, 0.15) });
  }
  const camera = new THREE.Vector3();
  const wrap = (v, c) => c + ((((v - c + AROUND.box) % (2 * AROUND.box)) + 2 * AROUND.box) % (2 * AROUND.box)) - AROUND.box;

  function place(dt) {
    const levelShare = blow ? Math.max(0, 1 - smooth(blow.age / (blow.seconds * 0.6))) * blow.level : level;
    if (world.camera) camera.copy(world.camera.position);
    let any = false;
    for (const c of cards) {
      if (!c.alive) continue;
      c.age += dt;
      if (c.age >= c.life) { c.alive = false; continue; }
      const k = c.age / c.life;
      switch (c.kind) {
        case 'drift': {
          if (!reduced) { c.x += c.vx * dt; c.z += c.vz * dt; }
          if (world.camera) {
            const x = wrap(c.x, camera.x), z = wrap(c.z, camera.z);
            if (x !== c.x || z !== c.z) { c.x = x; c.z = z; c.y = ground(x, z) + 0.6 + (c.seed % 1) * 2.9; }
          }
          c.opacity = AROUND.strength * levelShare;
          break;
        }
        case 'swirl': {
          if (!reduced) {
            c.turn += SWIRL.turn * dt;
            c.x = c.cx + Math.cos(c.turn) * c.r;
            c.z = c.cz + Math.sin(c.turn) * c.r;
            c.y += 0.35 * dt;
          }
          c.opacity = 0.55 * bump(k);
          c.bright = reduced ? bump(k) : 0;
          break;
        }
        case 'lift': {
          if (!reduced) { c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.w += 1.2 * dt; }
          c.opacity = 0.5 * bump(k);
          break;
        }
        case 'ring': {
          const b = Math.min(1, c.age / c.seconds);
          if (!reduced) {
            const r = c.r0 + c.reach * easeOut(b);
            c.x = c.fx + Math.cos(c.a) * r;
            c.z = c.fz + Math.sin(c.a) * r;
            c.y = c.y0 + 2.5 * easeOut(b);
            c.w = c.w0 * (1 + 0.8 * b);
            c.opacity = 0.85 * (1 - smooth((b - 0.5) / 0.5));
          } else c.opacity = 0.85 * (1 - smooth(b));
          break;
        }
        default: break;
      }
      if (c.opacity > 0.002) any = true;
    }
    // into the buffers
    for (const c of cards) {
      const o = c.alive ? c.opacity : 0;
      for (let v = 0; v < 4; v++) {
        const i = c.k * 4 + v;
        centres[i * 3] = c.x; centres[i * 3 + 1] = c.y; centres[i * 3 + 2] = c.z;
        data[i * 4] = c.w; data[i * 4 + 1] = c.h; data[i * 4 + 2] = o; data[i * 4 + 3] = c.seed;
        bright[i] = c.bright;
      }
    }
    centreAttr.needsUpdate = cardAttr.needsUpdate = brightAttr.needsUpdate = true;
    mesh.visible = any;
  }

  const cloud = {
    group, mesh, glowMesh, cards, reduced,
    /** How thick the cloud is now, 0 to 1. */
    get level() { return level; },
    get glowLevel() { return glowLevel; },
    setLevel(to, seconds = CLOUD.ease) {
      const target = Math.min(1, Math.max(0, to));
      blow = null;
      hold();
      if (!(seconds > 0)) {
        ease = null;
        level = target;
        heldDensity = densityAt(level);
        writeFog();
        return;
      }
      ease = { from: level, to: target, age: 0, seconds };
    },
    liftAt(point, r = 5) {
      dip = { age: 0 };
      const [x0, z0] = xz(point);
      for (let i = 0; i < LIFT.cards; i++) {
        const a = (i / LIFT.cards) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const d = r * rng.range(0.2, 0.6);
        const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
        spawn('lift', {
          x, z, y: ground(x, z) + rng.range(0.4, 1.2), w: rng.range(3, 5), h: rng.range(2, 3), life: LIFT.seconds,
          vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: rng.range(0.6, 1),
        });
      }
    },
    swirlAt(point) {
      const [x0, z0] = xz(point);
      const y0 = ground(x0, z0);
      const count = reduced ? 1 : SWIRL.cards;
      for (let i = 0; i < count; i++) {
        const turn = (i / count) * Math.PI * 2, r = reduced ? 0 : rng.range(1.2, 2);
        spawn('swirl', {
          cx: x0, cz: z0, turn, r, x: x0 + Math.cos(turn) * r, z: z0 + Math.sin(turn) * r, y: y0 + rng.range(0.5, 1.5),
          w: rng.range(2.5, 4), h: rng.range(2, 3), life: SWIRL.seconds,
        });
      }
    },
    glow(point, strength = 1) {
      if (point) glowUniforms.uCentre.value.set(point.x ?? point[0], point.y ?? point[1], point.z ?? point[2]);
      glowTo = point ? Math.max(0, strength) : 0;
    },
    blowAway({ from, seconds = CLOUD.blow } = {}) {
      const handle = new Handle('cloud blows away');
      const [fx, fz] = xz(from);
      blow?.handle.finish();
      blow = { age: 0, seconds, level, density: held ? heldDensity : (fog?.density ?? densityAt(level)), handle };
      ease = null;
      hold();
      for (let i = 0; i < RING; i++) {
        const a = (i / RING) * Math.PI * 2 + rng.range(-0.12, 0.12);
        const r0 = reduced ? rng.range(6, 18) : rng.range(2.5, 4);
        const w0 = rng.range(9, 14);
        const x = fx + Math.cos(a) * r0, z = fz + Math.sin(a) * r0;
        const y0 = ground(x, z) + rng.range(0.5, 6);
        spawn('ring', { a, r0, fx, fz, reach: radius + 30, w0, w: w0, h: w0 * rng.range(0.55, 0.75), x, z, y: y0, y0, seconds, life: seconds + 0.3 });
      }
      return handle;
    },
    update(dt, now = time + dt) {
      time = now;
      uniforms.uTime.value = now;
      if (ease) {
        ease.age += dt;
        level = ease.from + (ease.to - ease.from) * smooth(ease.age / ease.seconds);
        if (ease.age >= ease.seconds) { level = ease.to; ease = null; }
        heldDensity = densityAt(level);
      }
      if (dip) {
        dip.age += dt;
        if (dip.age >= LIFT.dipSeconds) dip = null;
      }
      if (blow) {
        blow.age += dt;
        const k = smooth(blow.age / blow.seconds);
        level = blow.level * (1 - k);
        heldDensity = blow.density + (LOOKS.sunset.fog.density - blow.density) * k;
        if (blow.age >= blow.seconds) {
          level = 0;
          heldDensity = LOOKS.sunset.fog.density;
          writeFog();
          letGo();
          blow.handle.finish();
          blow = null;
        }
      }
      writeFog();
      glowLevel = glowTo > glowLevel ? Math.min(glowTo, glowLevel + GLOW.rate * dt) : Math.max(glowTo, glowLevel - GLOW.rate * dt);
      glowUniforms.uLevel.value = glowLevel * GLOW.alpha;
      glowMesh.visible = glowLevel > 0.002;
      place(dt);
    },
    dispose() {
      blow?.handle.finish();
      blow = null;
      letGo();
      const look = world.lightLook ?? world.look;
      if (fog && look) {
        fog.density = look.fog.density;
        fog.color.set(look.fog.color);
      }
      group.removeFromParent();
      geometry.dispose(); material.dispose(); noise.dispose();
      glowGeometry.dispose(); glowMaterial.dispose();
    },
  };
  return cloud;
}
