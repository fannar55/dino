import * as THREE from 'three';

// Cones of light, all in one draw call: a spotlight's beam from a point in the air down to a place on the ground (the festival's
// stage, spec 6: "Kastarar", "Slóeðla stendur á þeim í ljóskeilu"). Each is an open cone of 24 triangles, soft at its edges (it
// fades where its side turns away from the camera) and at its source, added to the picture as the rings and the light points
// are, written anew every frame by whoever owns them; nothing here moves by itself. It lights nothing: a pool where it lands is
// the owner's to add (engine/show/rings.js `disc`).
//
//   const beams = createBeams(world, { capacity: 10 });
//   beams.begin();
//   beams.beam(from, to, width, r, g, b, level);   // from and to [x, y, z] or Vector3; width: metres across where it lands
//   beams.end();
//   beams.dispose();
//
// `r g b` is the colour as the screen shows it (sRGB, 0 to 1) and `level` its light (0 to 1). Not tone mapped, no fog, no
// shadow. Keep them narrow and few: what a beam costs is the screen it covers.
export const BEAM = { sides: 12, source: 0.08 }; // sides round a cone; its width at the source, as a share of where it lands

const VERTEX = /* glsl */`
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec4 aColour; // sRGB, level
attribute float aWidth;
varying vec3 vWorld;
varying vec3 vSide;
varying float vAlong;
varying vec4 vColour;
void main() {
  vec3 axis = aTo - aFrom;
  float len = max( length( axis ), 1e-4 );
  vec3 dir = axis / len;
  vec3 helper = abs( dir.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
  vec3 u = normalize( cross( dir, helper ) );
  vec3 v = cross( dir, u );
  vec3 side = u * position.x + v * position.z;
  float radius = 0.5 * aWidth * mix( ${BEAM.source.toFixed(3)}, 1.0, position.y );
  vec3 w = aFrom + dir * ( len * position.y ) + side * radius;
  vWorld = w;
  vSide = side;
  vAlong = position.y;
  vColour = aColour;
  gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
}`;
const FRAGMENT = /* glsl */`
varying vec3 vWorld;
varying vec3 vSide;
varying float vAlong;
varying vec4 vColour;
void main() {
  vec3 view = normalize( cameraPosition - vWorld );
  float facing = abs( dot( normalize( vSide ), view ) ); // 1 where the side faces the camera, 0 at the cone's outline
  float soft = facing * facing;
  float along = smoothstep( 0.0, 0.12, vAlong ) * mix( 1.0, 0.55, vAlong ); // out of nothing at the source, brightest near it
  float light = 0.5 * soft * along * vColour.a; // both sides are drawn, so the middle of a cone adds up to about its level
  if ( light < 0.003 ) discard;
  gl_FragColor = vec4( vColour.rgb * light, 0.0 );
}`;

export function createBeams(world, { capacity = 10, name = 'beams' } = {}) {
  const positions = [], index = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let s = 0; s < BEAM.sides; s++) {
      const a = (s / BEAM.sides) * Math.PI * 2;
      positions.push(Math.cos(a), ring, Math.sin(a));
    }
  }
  for (let s = 0; s < BEAM.sides; s++) {
    const n = (s + 1) % BEAM.sides;
    index.push(s, n, BEAM.sides + s, n, BEAM.sides + n, BEAM.sides + s);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const froms = new Float32Array(capacity * 3);
  const tos = new Float32Array(capacity * 3);
  const colours = new Float32Array(capacity * 4);
  const widths = new Float32Array(capacity);
  const attributes = [['aFrom', froms, 3], ['aTo', tos, 3], ['aColour', colours, 4], ['aWidth', widths, 1]].map(([key, array, size]) => {
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
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false; // placed in the shader
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 7; // after the rings and the light points
  mesh.visible = false;
  world.scene?.add(mesh);
  let count = 0;
  const xyz = p => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

  return {
    mesh, capacity,
    /** How many beams the last frame had (24 triangles each). */
    get count() { return count; },
    read(i) {
      return { from: [...froms.subarray(i * 3, i * 3 + 3)], to: [...tos.subarray(i * 3, i * 3 + 3)], width: widths[i], colour: [...colours.subarray(i * 4, i * 4 + 4)] };
    },
    begin() { count = 0; },
    beam(from, to, width, r, g, b, level = 1) {
      if (count >= capacity || !(level > 0.003) || !(width > 0)) return;
      froms.set(xyz(from), count * 3);
      tos.set(xyz(to), count * 3);
      colours.set([r, g, b, Math.min(1, level)], count * 4);
      widths[count] = width;
      count++;
    },
    end() {
      for (const attribute of attributes) attribute.needsUpdate = true;
      geometry.instanceCount = count;
      mesh.visible = count > 0;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
