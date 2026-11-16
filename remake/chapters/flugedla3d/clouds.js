// Flugeðla og fiðrildið's clouds (chapters/flugedla3d.js): soft balls (stage.js cloudBalls: the sea, its towers and the wisps under
// its base), each a card turned to the camera, white on top with the low sun on it and blue-grey underneath, fading out at its rim
// with a lumpy edge, and into the sky's haze far off. One draw call, sorted far to near each frame so the soft edges blend.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec4 aBall; // xyz: centre, w: radius
attribute float aKind;
uniform vec3 uBase; // the lane's ground level (the balls' heights are over it)
varying vec2 vUv;
varying float vHeight;
varying float vDist;
varying float vSeed;
void main() {
  vec3 centre = aBall.xyz + uBase;
  vec4 mv = viewMatrix * vec4( centre, 1.0 );
  mv.xy += position.xy * aBall.w * 2.2;
  vUv = position.xy * 2.0;
  vHeight = position.y * 2.0;
  vDist = -mv.z;
  vSeed = fract( sin( dot( aBall.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform vec3 uTop;
uniform vec3 uUnder;
uniform vec3 uHaze;
uniform vec2 uFar;
varying vec2 vUv;
varying float vHeight;
varying float vDist;
varying float vSeed;
void main() {
  float r = length( vUv );
  float a = atan( vUv.y, vUv.x );
  // a lumpy rim: a few slow waves round it, different for each ball
  float rim = 0.78 + 0.1 * sin( a * 3.0 + vSeed * 6.28 ) + 0.06 * sin( a * 7.0 + vSeed * 19.0 );
  float alpha = 1.0 - smoothstep( rim * 0.55, rim, r );
  if ( alpha < 0.01 ) discard;
  vec3 colour = mix( uUnder, uTop, smoothstep( -0.7, 0.6, vHeight ) );
  float haze = smoothstep( uFar.x, uFar.y, vDist );
  colour = mix( colour, uHaze, haze * 0.75 );
  gl_FragColor = vec4( colour, alpha * 0.92 );
}`;

export function createClouds(world, balls, { base = 0 } = {}) {
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  const n = balls.length;
  const aBall = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const aKind = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  aBall.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aBall', aBall);
  geometry.setAttribute('aKind', aKind);
  geometry.instanceCount = n;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uBase: { value: new THREE.Vector3(0, base, 0) },
      uTop: { value: new THREE.Color('#fff4e2') },
      uUnder: { value: new THREE.Color('#b9c6d3') },
      uHaze: { value: new THREE.Color('#d9e4ee') },
      uFar: { value: new THREE.Vector2(120, 320) },
    },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = 'flugedla3d clouds';
  world.scene.add(mesh);
  const order = balls.map((_, i) => i);
  const dist = new Float32Array(n);
  /** Sort far to near from the camera's place (heights over the lane's ground). */
  function update(cam) {
    const cy = cam.y - base;
    for (let i = 0; i < n; i++) { const b = balls[i]; dist[i] = (b[0] - cam.x) ** 2 + (b[1] - cy) ** 2 + (b[2] - cam.z) ** 2; }
    order.sort((p, q) => dist[q] - dist[p]);
    for (let j = 0; j < n; j++) {
      const b = balls[order[j]];
      aBall.setXYZW(j, b[0], b[1], b[2], b[3]);
      aKind.setX(j, b[4]);
    }
    aBall.needsUpdate = true;
    aKind.needsUpdate = true;
  }
  return { mesh, update, setBase(y) { material.uniforms.uBase.value.y = y; base = y; }, count: n };
}
