import * as THREE from 'three';

// Light lying on the water or the ground, all in one draw call: rings that spread (a splash's, the beat's) and soft discs (the
// light under a group). Each is one flat square (two triangles) that draws its own ring or disc, written anew every frame by
// whoever owns them (chapter 5's show: chapters/kafli5-show.js); nothing here moves by itself.
//
//   const rings = createRings(world, { capacity: 40 });
//   rings.begin();
//   rings.ring(x, y, z, radius, width, r, g, b, level);   // a ring `radius` m out, `width` m wide (soft)
//   rings.disc(x, y, z, radius, r, g, b, level);          // a disc of light, soft at its edge
//   rings.end();
//   rings.dispose();
//
// `r g b` is the colour as the screen shows it (sRGB, 0 to 1) and `level` its light (0 to 1): it is added to the picture, so it
// only lights what is under it. Not tone mapped, no fog, no shadow. Two triangles for each one drawn, none for those that are not.
const VERTEX = /* glsl */`
attribute vec3 aCentre;
attribute vec3 aRing; // radius (m), width (m), 1 for a disc
attribute vec4 aColour; // sRGB, level
varying vec2 vAt;
varying vec3 vRing;
varying vec4 vColour;
void main() {
  float reach = aRing.x + 2.5 * aRing.y;
  vAt = position.xz * reach;
  vRing = aRing;
  vColour = aColour;
  gl_Position = projectionMatrix * viewMatrix * vec4(aCentre + vec3(vAt.x, 0.0, vAt.y), 1.0);
}`;
const FRAGMENT = /* glsl */`
varying vec2 vAt;
varying vec3 vRing;
varying vec4 vColour;
void main() {
  float d = length(vAt);
  float x = (d - vRing.x) / vRing.y;
  float ring = exp(-x * x);
  float disc = 1.0 - smoothstep(0.35 * vRing.x, vRing.x, d);
  float light = mix(ring, disc * disc, vRing.z) * vColour.a;
  if (light < 0.004) discard;
  gl_FragColor = vec4(vColour.rgb * light, 0.0);
}`;

export function createRings(world, { capacity = 40, name = 'rings' } = {}) {
  const square = new THREE.BufferGeometry();
  square.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, -1, 0, 1, 1, 0, 1, 1, 0, -1], 3));
  square.setIndex([0, 1, 2, 0, 2, 3]);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = square.index;
  geometry.setAttribute('position', square.getAttribute('position'));
  const centres = new Float32Array(capacity * 3);
  const shapes = new Float32Array(capacity * 3);
  const colours = new Float32Array(capacity * 4);
  const attributes = [['aCentre', centres, 3], ['aRing', shapes, 3], ['aColour', colours, 4]].map(([key, array, size]) => {
    const attribute = new THREE.InstancedBufferAttribute(array, size);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(key, attribute);
    return attribute;
  });
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  material.name = name;
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.frustumCulled = false;
  object.castShadow = false;
  object.receiveShadow = false;
  object.renderOrder = 5; // after the water
  world.scene?.add(object);
  let count = 0;

  function add(x, y, z, radius, width, disc, r, g, b, level) {
    if (count >= capacity || !(level > 0.004) || !(radius > 0)) return;
    centres.set([x, y, z], count * 3);
    shapes.set([radius, width, disc], count * 3);
    colours.set([r, g, b, Math.min(1, level)], count * 4);
    count++;
  }
  return {
    object, capacity,
    /** How many rings and discs the last frame had (two triangles each). */
    get count() { return count; },
    read(i) {
      return { centre: [...centres.subarray(i * 3, i * 3 + 3)], shape: [...shapes.subarray(i * 3, i * 3 + 3)], colour: [...colours.subarray(i * 4, i * 4 + 4)] };
    },
    begin() { count = 0; },
    ring(x, y, z, radius, width, r, g, b, level = 1) { add(x, y, z, radius, Math.max(0.02, width), 0, r, g, b, level); },
    disc(x, y, z, radius, r, g, b, level = 1) { add(x, y, z, radius, 0, 1, r, g, b, level); },
    end() {
      for (const attribute of attributes) attribute.needsUpdate = true;
      geometry.instanceCount = count;
      object.visible = count > 0;
    },
    dispose() {
      object.removeFromParent();
      geometry.dispose();
      square.dispose();
      material.dispose();
    },
  };
}
