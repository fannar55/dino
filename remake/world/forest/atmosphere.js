// Air: soft light shafts slanting through the shaded forest, and drifting motes that glint when
// the camera looks toward the sun. Both are additive (order independent, no sorting), respect the
// height fog through three's fog chunks, and read time from the shared wind clock so a frozen
// capture is frozen here too. A fern glade (layout.glade.shafts) adds shafts that land inside its
// clearing, slanting in from the sun side, with glittering motes floating in them: the same
// meshes, so no draw call more.
import * as THREE from 'three';
import { FOREST, PALETTE, gladeOf } from './config.js';
import { createRng, smoothstep } from './random.js';

function srgbToLinear(hex) {
  const c = new THREE.Color(hex); // THREE.Color converts sRGB hex to linear
  return [c.r, c.g, c.b];
}

function fogUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
}

const SHAFT_VERT = /* glsl */`
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aShaft;
attribute float aGlade;
uniform vec2 uGladeNear;
varying vec2 vUv;
varying float vSeed;
varying float vNear;
varying float vGlade;
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 axis = aEnd - aStart;
  vec3 p = aStart + axis * aShaft.y;
  vec3 toCam = normalize( cameraPosition - p );
  vec3 side = normalize( cross( normalize( axis ), toCam ) );
  p += side * ( aShaft.x - 0.5 ) * aShaft.z * mix( 0.75, 1.35, aShaft.y );
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  vUv = aShaft.xy;
  vSeed = aShaft.w;
  float camDist = length( cameraPosition - p );
  vNear = mix( smoothstep( 3.0, 9.0, camDist ), smoothstep( uGladeNear.x, uGladeNear.y, camDist ), aGlade );
  vGlade = aGlade;
  vWorld = p;
  #include <fog_vertex>
}`;

const SHAFT_FRAG = /* glsl */`
uniform vec3 uShaftColor;
uniform float uStrength;
uniform float uWindTime;
uniform vec3 uSunDir;
uniform float uGladeStrength;
varying vec2 vUv;
varying float vSeed;
varying float vNear;
varying float vGlade;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  float across = 1.0 - abs( vUv.x * 2.0 - 1.0 );
  float a = across * across * ( 3.0 - 2.0 * across );
  // a glade's shaft comes down to the floor it lights; the forest's fades out well above it
  a *= smoothstep( 0.0, 0.3, vUv.y ) * smoothstep( 1.0, mix( 0.62, 0.8, vGlade ), vUv.y );
  a *= 0.7 + 0.3 * sin( uWindTime * 0.31 + vSeed * 23.0 );
  vec3 viewDir = normalize( vWorld - cameraPosition );
  a *= 0.45 + 1.1 * pow( max( dot( viewDir, uSunDir ), 0.0 ), 3.0 );
  gl_FragColor = vec4( uShaftColor, a * vNear * uStrength * mix( 1.0, uGladeStrength, vGlade ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const MOTE_VERT = /* glsl */`
attribute vec4 aMote;
uniform float uWindTime;
uniform vec2 uWindDirection;
uniform float uPixelScale;
uniform vec3 uSunDir;
varying float vAlpha;
#include <common>
#include <fog_pars_vertex>
void main() {
  float t = uWindTime;
  float s = aMote.x * 6.2831853;
  vec3 p = position;
  float drift = fract( t * 0.012 + aMote.y );
  p.xz += uWindDirection * ( drift - 0.5 ) * 3.0 * ( 1.0 - 0.6 * aMote.w ); // w = 1: a mote of a glade's shaft, which stays in it
  p.x += sin( t * 0.23 + s ) * 0.55;
  p.y += sin( t * 0.31 + s * 1.7 ) * 0.3;
  p.z += cos( t * 0.19 + s * 1.3 ) * 0.55;
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  float d = max( -mvPosition.z, 0.1 );
  gl_PointSize = clamp( uPixelScale * aMote.z / d, 1.0, 5.0 );
  vec3 viewDir = normalize( p - cameraPosition );
  float glint = pow( max( dot( viewDir, uSunDir ), 0.0 ), 5.0 );
  vAlpha = ( 0.18 + 1.3 * glint ) * ( 0.55 + 0.45 * sin( t * 1.3 + s * 3.0 ) ) * smoothstep( 0.8, 2.5, d ) * smoothstep( 0.0, 0.15, drift ) * smoothstep( 1.0, 0.85, drift );
  #include <fog_vertex>
}`;

const MOTE_FRAG = /* glsl */`
uniform vec3 uMoteColor;
uniform float uStrength;
varying float vAlpha;
#include <common>
#include <fog_pars_fragment>
void main() {
  float r = length( gl_PointCoord - 0.5 ) * 2.0;
  float a = smoothstep( 1.0, 0.1, r ) * vAlpha * uStrength;
  gl_FragColor = vec4( uMoteColor, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function createAtmosphere(world, { layout, seed, terrain, shared, sun, q }) {
  const [cx, cz] = layout.clearing.center;
  const clearR = layout.clearing.radius;
  const edgeR = layout.forestEdge;
  const glade = gladeOf(layout);
  const group = new THREE.Group();
  group.name = 'Atmosphere';
  const sunDir = sun.clone().normalize();
  const disposables = [];
  const gladeShafts = []; // where a glade's shafts land, for the motes that float in them

  // ---- light shafts in the shaded forest and, in a glade, landing in the clearing --------------
  {
    const rng = createRng(seed, 'shafts');
    const count = Math.max(2, Math.round(FOREST.shafts.count * (q.name === 'low' ? 0.6 : 1)));
    const aStart = [], aEnd = [], aShaft = [], aGlade = [], idx = [];
    const addShaft = (start, ground, w, seedV, inGlade) => {
      const base = aStart.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        aStart.push(...start);
        aEnd.push(...ground);
        aShaft.push(u, v, w, seedV);
        aGlade.push(inGlade);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const a0 = rng.angle();
    for (let i = 0; i < count; i++) {
      const a = a0 + (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const r = rng.range(edgeR + 6, edgeR + 17);
      const gx = cx + Math.cos(a) * r, gz = cz + Math.sin(a) * r;
      const gy = terrain.heightAt(gx, gz) + 0.2;
      const top = rng.range(11, 15);
      const L = top / Math.max(0.2, sunDir.y);
      const start = [gx + sunDir.x * L, gy + sunDir.y * L, gz + sunDir.z * L];
      const w = rng.range(FOREST.shafts.width[0], FOREST.shafts.width[1]);
      addShaft(start, [gx, gy, gz], w, rng.next(), 0);
    }
    // The glade's shafts come in over the trees on the sun side and land inside the clearing, spread over it
    // the way seeds sit in a sunflower (never two together). They have a stream of their own.
    if (glade.shafts > 0) {
      const S = FOREST.glade.shaft;
      const grng = createRng(seed, 'glade-shafts');
      const turn = grng.angle();
      for (let i = 0; i < glade.shafts; i++) {
        const a = turn + i * GOLDEN_ANGLE + grng.range(-0.2, 0.2);
        const reach = S.ground[0] + (S.ground[1] - S.ground[0]) * Math.sqrt((i + 0.5) / glade.shafts) + grng.range(-0.04, 0.04);
        const gx = cx + Math.cos(a) * clearR * reach, gz = cz + Math.sin(a) * clearR * reach;
        const gy = terrain.heightAt(gx, gz) + 0.2;
        const L = grng.range(S.top[0], S.top[1]) / Math.max(0.2, sunDir.y);
        const w = grng.range(S.width[0], S.width[1]);
        addShaft([gx + sunDir.x * L, gy + sunDir.y * L, gz + sunDir.z * L], [gx, gy, gz], w, grng.next(), 1);
        gladeShafts.push({ ground: [gx, gy, gz], length: L, width: w });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(aEnd.slice(), 3));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(aStart, 3));
    g.setAttribute('aEnd', new THREE.Float32BufferAttribute(aEnd, 3));
    g.setAttribute('aShaft', new THREE.Float32BufferAttribute(aShaft, 4));
    g.setAttribute('aGlade', new THREE.Float32BufferAttribute(aGlade, 1));
    g.setIndex(idx);
    const material = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
      uniforms: {
        ...fogUniforms(),
        uShaftColor: { value: new THREE.Color(PALETTE.shaft) },
        uStrength: { value: FOREST.shafts.strength },
        uWindTime: shared.uWindTime,
        uSunDir: { value: sunDir },
        uGladeStrength: { value: FOREST.glade.shaft.strength },
        uGladeNear: { value: new THREE.Vector2(...FOREST.glade.shaft.near) },
      },
      fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    material.name = 'forest-shafts';
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'Light shafts';
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    group.add(mesh);
    disposables.push(g, material);
  }

  // ---- motes drifting in the sunny clearing and, in a glade, floating in its shafts -------------
  const moteUniforms = {
    ...fogUniforms(),
    uMoteColor: { value: new THREE.Color('#fff4d6') },
    uStrength: { value: 0.9 },
    uWindTime: shared.uWindTime,
    uWindDirection: shared.uWindDirection,
    uPixelScale: { value: 800 },
    uSunDir: { value: sunDir },
  };
  {
    const rng = createRng(seed, 'motes');
    const count = Math.round(FOREST.motes.count * (q.name === 'low' ? 0.5 : 1));
    const pos = [], mote = [];
    for (let i = 0; i < count; i++) {
      const a = rng.angle(), r = Math.sqrt(rng.next()) * FOREST.motes.radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      pos.push(x, terrain.heightAt(x, z) + rng.range(FOREST.motes.height[0], FOREST.motes.height[1]), z);
      mote.push(rng.next(), rng.next(), rng.range(0.02, 0.045), 0);
    }
    // A few glittering motes in each shaft of a glade, within its core and in its lower reaches where the eye is.
    // w = 1 marks them: they drift less than the clearing's, so they stay in their shaft.
    if (gladeShafts.length) {
      const mrng = createRng(seed, 'glade-motes');
      const each = Math.round(FOREST.glade.shaft.motes * (q.name === 'low' ? 0.5 : 1));
      const side = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
      const rise = new THREE.Vector3().crossVectors(side, sunDir);
      for (const shaft of gladeShafts) {
        for (let i = 0; i < each; i++) {
          const t = mrng.range(0.04, 0.45); // how far up the shaft; the shaft is wider near the ground
          const out = Math.sqrt(mrng.next()) * 0.35 * shaft.width * (1.35 - 0.6 * t);
          const turn = mrng.angle();
          pos.push(
            shaft.ground[0] + sunDir.x * shaft.length * t + (side.x * Math.cos(turn) + rise.x * Math.sin(turn)) * out,
            shaft.ground[1] + sunDir.y * shaft.length * t + (side.y * Math.cos(turn) + rise.y * Math.sin(turn)) * out,
            shaft.ground[2] + sunDir.z * shaft.length * t + (side.z * Math.cos(turn) + rise.z * Math.sin(turn)) * out,
          );
          mote.push(mrng.next(), mrng.next(), mrng.range(0.02, 0.045), 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aMote', new THREE.Float32BufferAttribute(mote, 4));
    const material = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, uniforms: moteUniforms,
      fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    material.name = 'forest-motes';
    const points = new THREE.Points(g, material);
    points.name = 'Motes';
    points.frustumCulled = false;
    points.renderOrder = 11;
    group.add(points);
    disposables.push(g, material);
  }

  // ---- a few pale butterflies looping over the clearing ----------------------------------------
  const butterflyCentres = [];
  {
    const rng = createRng(seed, 'butterflies');
    const count = q.name === 'low' ? 2 : FOREST.butterflies.count;
    const colours = ['#f6f1e4', '#f2dc94', '#f3b996', '#f6f1e4'];
    const pos = [], col = [], fly = [], idx = [];
    // one wing in local space: x forward along the body, z out to the side, y up
    const wing = [[0.0, 0.0], [0.05, 0.035], [0.075, 0.085], [0.03, 0.105], [-0.02, 0.085], [-0.06, 0.06], [-0.055, 0.02]];
    for (let b = 0; b < count; b++) {
      const a = rng.angle(), r = rng.range(3.5, 7.5);
      const centre = [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r];
      centre[1] = terrain.heightAt(centre[0], centre[2]);
      const loop = [rng.range(1.4, 2.6), rng.range(1.2, 2.2), rng.range(0.7, 1.6)]; // x radius, z radius, base height
      const speed = rng.range(0.55, 0.85), phase = rng.angle();
      const c = srgbToLinear(colours[b % colours.length]);
      const edge = c.map(v => v * 0.55);
      for (const side of [-1, 1]) {
        const base = pos.length / 3;
        wing.forEach(([wx, wz], i) => {
          pos.push(wx, 0, wz * side);
          col.push(...(i === 0 ? edge : i === 2 || i === 3 ? edge : c));
          fly.push(b, side, speed, phase);
        });
        // fan from the root vertex
        for (let i = 1; i < wing.length - 1; i++) idx.push(base, base + i, base + i + 1);
      }
      // body: a thin dark sliver
      const base = pos.length / 3;
      for (const [bx, bz] of [[0.045, 0], [-0.04, -0.006], [-0.04, 0.006]]) {
        pos.push(bx, 0.002, bz); col.push(0.12, 0.1, 0.08); fly.push(b, 0, speed, phase);
      }
      idx.push(base, base + 1, base + 2);
      butterflyCentres.push(centre, loop);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aFly', new THREE.Float32BufferAttribute(fly, 4));
    g.setIndex(idx);
    const centres = [], loops = [];
    for (let i = 0; i < butterflyCentres.length; i += 2) {
      centres.push(new THREE.Vector3(...butterflyCentres[i]));
      loops.push(new THREE.Vector3(...butterflyCentres[i + 1]));
    }
    while (centres.length < 4) { centres.push(new THREE.Vector3()); loops.push(new THREE.Vector3(1, 1, 1)); }
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    material.name = 'forest-butterflies';
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { uWindTime: shared.uWindTime, uFlyCentre: { value: centres }, uFlyLoop: { value: loops } });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec4 aFly;
uniform float uWindTime;
uniform vec3 uFlyCentre[4];
uniform vec3 uFlyLoop[4];
vec3 flyPath( int id, float t ) {
  vec3 c = uFlyCentre[ id ];
  vec3 l = uFlyLoop[ id ];
  return c + vec3( sin( t ) * l.x + sin( t * 2.3 ) * 0.35, l.z + 0.35 * sin( t * 1.7 ) + 0.12 * sin( t * 5.1 ), sin( t * 0.83 + 1.1 ) * l.y + cos( t * 1.9 ) * 0.3 );
}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  int flyId = int( aFly.x + 0.5 );
  float flyT = uWindTime * aFly.z + aFly.w;
  vec3 flyP = flyPath( flyId, flyT );
  vec3 flyAhead = flyPath( flyId, flyT + 0.05 ) - flyP;
  float yaw = atan( flyAhead.z, flyAhead.x );
  float flap = 0.25 + 1.05 * ( 0.5 + 0.5 * sin( uWindTime * 17.0 + aFly.w * 7.0 ) );
  vec3 lp = transformed;
  // flap: rotate the wing about the body axis (x)
  lp = vec3( lp.x, lp.y * cos( flap ) + abs( lp.z ) * sin( flap ), lp.z * cos( flap ) );
  lp *= 1.6;
  float cy = cos( yaw ), sy = sin( yaw );
  transformed = flyP + vec3( lp.x * cy - lp.z * sy, lp.y, lp.x * sy + lp.z * cy );`);
    };
    material.customProgramCacheKey = () => 'forest-butterflies';
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'Butterflies';
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    disposables.push(g, material);
  }

  const size = new THREE.Vector2();
  function update(camera) {
    world.renderer.getDrawingBufferSize(size);
    moteUniforms.uPixelScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  return { group, update, dispose() { for (const d of disposables) d.dispose(); } };
}
