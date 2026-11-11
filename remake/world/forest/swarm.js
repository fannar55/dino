// A swarm of pale butterflies that the code flies, every one of them, every frame: the clearing's pale butterflies
// (butterflies.js) made again, the same wing (WING), the same colours (COLOURS), the same flat unlit material and the same wing
// beat on the shared wind clock, but as many as asked and each where the code puts it. One mesh, one draw call: the shader reads
// where each one is, which way it faces and how big it is (0 hides it) from uniform arrays the code fills (set), and beats its
// wings by itself, each at its own phase, unless the code holds them at an angle (a butterfly sitting with its wings closed).
//
// Made for the 3D show (chapters/fidrildi3d.js), where the swarm dances in front of the screen: a butterfly near the lens wears
// away from its wing tips in, as the pale ones do, but much nearer (from 1.2 m in to 0.6 m) so a whole one can come out of the
// screen. Chapter 1's butterflies are not touched by it.
import * as THREE from 'three';
import { WING, COLOURS } from './butterflies.js';
import { createRng } from './random.js';

const VERTEX_HEAD = (count) => `#include <common>
attribute vec4 aSwarm; // x which butterfly, y its wing's side (0 the body), z its phase, w unused
uniform float uWindTime;
uniform vec4 uSwarmAt[${count}]; // xyz where it is, w how big (1 its own size, 0 hidden)
uniform vec2 uSwarmFace[${count}]; // x which way it faces (radians, 0 along +X), y its wings' angle when held, or below 0 to beat
uniform float uSwarmScale;
varying float vSwarmNear;`;

const VERTEX_BODY = `#include <begin_vertex>
  int swarmId = int( aSwarm.x + 0.5 );
  vec4 swarmAt = uSwarmAt[ swarmId ];
  vec2 swarmFace = uSwarmFace[ swarmId ];
  float flap = swarmFace.y >= 0.0 ? swarmFace.y : 0.25 + 1.05 * ( 0.5 + 0.5 * sin( uWindTime * 17.0 + aSwarm.z * 7.0 ) );
  vec3 lp = transformed;
  lp = vec3( lp.x, lp.y * cos( flap ) + abs( lp.z ) * sin( flap ), lp.z * cos( flap ) );
  lp *= 1.6 * uSwarmScale * swarmAt.w;
  float cy = cos( swarmFace.x ), sy = sin( swarmFace.x );
  transformed = swarmAt.xyz + vec3( lp.x * cy - lp.z * sy, lp.y, lp.x * sy + lp.z * cy );
  float swarmNear = smoothstep( 0.6, 1.2, -( modelViewMatrix * vec4( transformed, 1.0 ) ).z );
  float swarmEdge = clamp( length( position.xz ) / 0.11, 0.0, 1.0 );
  vSwarmNear = clamp( 2.0 * swarmNear - 0.8 * swarmEdge, 0.0, 1.0 ) * step( 0.001, swarmAt.w );`;

const FRAGMENT_HEAD = `#include <common>
varying float vSwarmNear;`;
const FRAGMENT_BODY = `#include <color_fragment>
  diffuseColor.a *= vSwarmNear;`;

function srgbToLinear(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * A swarm of `count` pale butterflies, all hidden until set. `scale` sizes them all against the clearing's pale ones. `uWindTime`
 * is the shared wind clock's uniform (world.wind.uniforms.uWindTime). Returns { mesh, count, set(i, position, yaw, size, flap),
 * dispose }; add the mesh to the scene yourself.
 */
export function createSwarm({ count = 25, scale = 1, seed = 'swarm', uWindTime, antialias = true } = {}) {
  const rng = createRng(seed, 'swarm');
  const pos = [], col = [], tag = [], idx = [];
  for (let b = 0; b < count; b++) {
    const phase = rng.angle();
    const c = srgbToLinear(COLOURS[b % COLOURS.length]);
    const edge = c.map(v => v * 0.55);
    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      WING.forEach(([wx, wz], i) => {
        pos.push(wx, 0, wz * side);
        col.push(...(i === 0 || i === 2 || i === 3 ? edge : c));
        tag.push(b, side, phase, 0);
      });
      for (let i = 1; i < WING.length - 1; i++) idx.push(base, base + i, base + i + 1);
    }
    const base = pos.length / 3;
    for (const [bx, bz] of [[0.045, 0], [-0.04, -0.006], [-0.04, 0.006]]) {
      pos.push(bx, 0.002, bz); col.push(0.12, 0.1, 0.08); tag.push(b, 0, phase, 0);
    }
    idx.push(base, base + 1, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('aSwarm', new THREE.Float32BufferAttribute(tag, 4));
  geometry.setIndex(idx);
  const at = Array.from({ length: count }, () => new THREE.Vector4(0, 0, 0, 0));
  const face = Array.from({ length: count }, () => new THREE.Vector2(0, -1));
  const uniforms = { uWindTime: uWindTime ?? { value: 0 }, uSwarmAt: { value: at }, uSwarmFace: { value: face }, uSwarmScale: { value: scale } };
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: Boolean(antialias) });
  material.name = 'swarm-butterflies';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_HEAD(count))
      .replace('#include <begin_vertex>', VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_HEAD)
      .replace('#include <color_fragment>', FRAGMENT_BODY);
  };
  material.customProgramCacheKey = () => `swarm-butterflies-${count}`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Swarm';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return {
    mesh, count, uniforms,
    /** Butterfly i at `position`, facing `yaw`, `size` of its own (0 hides it), its wings held at `flap` radians or beating (below 0). */
    set(i, position, yaw = 0, size = 1, flap = -1) {
      at[i].set(position.x, position.y, position.z, size);
      face[i].set(yaw, flap);
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
