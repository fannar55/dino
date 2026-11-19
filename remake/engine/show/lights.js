import * as THREE from 'three';

// Small lights in the air, all in one draw call: fireflies, glowing notes, drops of water catching the sun. Each is a point with a
// soft halo and a bright core, as wide in metres as it is told, written anew every frame by whoever owns them (chapter 5's show:
// chapters/kafli5-show.js), so what they do is the owner's function of its own clock and nothing here moves by itself.
//
//   const lights = createLightPoints(world, { capacity: 600 });
//   lights.begin();
//   lights.add(x, y, z, size, r, g, b, level, solid);   // as many as `capacity`; the rest are dropped
//   lights.end();
//   lights.dispose();
//
// `size` is metres across (the halo's edge), `r g b` the colour as the screen shows it (sRGB, 0 to 1), `level` its light (0 to 1),
// `solid` how much it covers what is behind it (0: light only, added to the picture, a firefly at dusk; 1: a drop of water in the
// day). The lights are not tone mapped and take no fog, so they shine the same in the dusk and in the day. No triangles; a point
// too far away to be 2.5 px wide stays 2.5 px and dims instead, so a far firefly neither flickers nor vanishes.
const VERTEX = /* glsl */`
uniform float uPixel;
attribute vec2 aShape; // metres across, solid
attribute vec4 aColour; // sRGB, level
varying vec4 vColour;
varying float vSolid;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float px = aShape.x * uPixel / max(0.3, -mvPosition.z);
  vColour = vec4(aColour.rgb, aColour.a * clamp(px / 2.5, 0.0, 1.0));
  vSolid = aShape.y;
  gl_PointSize = aColour.a > 0.003 ? max(px, 2.5) : 0.0;
  gl_Position = projectionMatrix * mvPosition;
}`;
const FRAGMENT = /* glsl */`
varying vec4 vColour;
varying float vSolid;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d >= 1.0) discard;
  float edge = 1.0 - smoothstep(0.75, 1.0, d);
  float halo = exp(-d * d * 5.0) * edge;
  float core = exp(-d * d * 30.0);
  vec3 light = vColour.rgb * (halo * 0.85 + core * 0.6) + vec3(core * 0.55);
  // its own light added to the picture, over as much of the picture as it covers (premultiplied)
  gl_FragColor = vec4(light * vColour.a, clamp((halo * 0.7 + core) * vSolid * vColour.a, 0.0, 1.0));
}`;

export function createLightPoints(world, { capacity = 600, name = 'lights' } = {}) {
  const positions = new Float32Array(capacity * 3);
  const shapes = new Float32Array(capacity * 2);
  const colours = new Float32Array(capacity * 4);
  const geometry = new THREE.BufferGeometry();
  const attributes = [['position', positions, 3], ['aShape', shapes, 2], ['aColour', colours, 4]].map(([key, array, size]) => {
    const attribute = new THREE.BufferAttribute(array, size);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(key, attribute);
    return attribute;
  });
  geometry.setDrawRange(0, 0);
  const uniforms = { uPixel: { value: 900 } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  material.name = name;
  const object = new THREE.Points(geometry, material);
  object.name = name;
  object.frustumCulled = false; // they are all over the place, and few
  object.renderOrder = 6; // after the water and the lights lying on it
  world.scene?.add(object);
  const buffer = new THREE.Vector2();
  let count = 0;

  return {
    object, capacity,
    /** How many lights the last frame had. */
    get count() { return count; },
    /** The lights of the frame, as they were written (for a test): [x, y, z], [size, solid] and [r, g, b, level] of light `i`. */
    read(i) {
      return { position: [...positions.subarray(i * 3, i * 3 + 3)], shape: [...shapes.subarray(i * 2, i * 2 + 2)], colour: [...colours.subarray(i * 4, i * 4 + 4)] };
    },
    begin() { count = 0; },
    add(x, y, z, size, r, g, b, level = 1, solid = 0.3) {
      if (count >= capacity || !(level > 0.003) || !(size > 0)) return;
      positions.set([x, y, z], count * 3);
      shapes.set([size, solid], count * 2);
      colours.set([r, g, b, Math.min(1, level)], count * 4);
      count++;
    },
    end() {
      for (const attribute of attributes) attribute.needsUpdate = true;
      geometry.setDrawRange(0, count);
      object.visible = count > 0;
      // a metre at one metre from the camera, in the drawing buffer's pixels
      const camera = world.camera;
      const height = world.renderer?.getDrawingBufferSize?.(buffer)?.y;
      if (camera?.isPerspectiveCamera && height > 0) uniforms.uPixel.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
    dispose() {
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
