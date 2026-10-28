import * as THREE from 'three';

// Footprints: the big prints a walking character presses into soft soil (spec scene 6: "stór fótspor Mosa í mjúkri
// moldinni", Mosi's big footprints in the soft soil of the path). Wherever one of the feet it is told of comes down,
// a print is pressed into the ground under it, turned the way the walker faces and tilted to the slope, and after a
// while it fades away. A print is a soft rounded pad with three toes ahead of it, drawn darker than the soil it lies
// on: it multiplies what is under it (multiply blending), so it darkens the ground as it is lit, in sun or in shade,
// and needs no light of its own. Every print is one instance of one mesh: one draw call for all of them, at most
// `max` alive (the oldest makes way), about 150 triangles each.
//
//   const prints = createFootprints(world, { actor: mosi, feet: [{ bone: 'BackFootL', size: 1.1, ahead: -0.35 }, ...] });
//   prints.dispose();                     // when the place changes: the prints belong to the ground they lie on
//
// A foot comes down when its bone, having risen more than 3 cm above where it stood when the prints were made, comes
// back to within 8 mm of it (as kafli1's footsteps hear it), so make the prints while the walker stands. `ahead` moves
// a print along the way the walker faces from under the bone (a sole is not centred on its ankle). Everything runs on
// the game clock: the prints put themselves on world.effects (engine/effects.js, which main.js updates after the actors)
// and age with world.clock.time, so a paused game holds them and a capture lands on the same prints.

const LIFE = 14; // seconds a print lies as it was pressed
const FADE = 4; // and the seconds it takes to fade after that
const PRESS = 0.2; // seconds a print takes to darken as the foot comes down
const RISE = 0.03; // metres a foot rises above its standing height before its next fall counts
const LAND = 0.008; // and how near that height it must come back
const LIFT = 0.012; // metres a print lies above the ground, which the polygon offset keeps it on
// What the soil is multiplied by inside a print: a little darker, a little warmer. Plain numbers, not a THREE.Color: the
// canvas holds display colours (renderer.js) and the print blends with them as they are.
const TINT = [0.5, 0.43, 0.36];
const NEAR = 12; // metres from the camera beyond which a print fades out (the height fog does not reach it)
const FAR = 30;

/** How dark a print is, 0 to 1, `age` seconds after its foot came down: pressed in quickly, held, then gone (the shader's rule). */
export function printLevel(age) {
  if (!(age >= 0)) return 0;
  const press = Math.min(1, age / PRESS);
  const gone = THREE.MathUtils.smoothstep(age, LIFE, LIFE + FADE);
  return press * (1 - gone);
}
export const PRINT_SECONDS = LIFE + FADE; // how long a print can be seen at all

// One print in its own frame, at size 1: x the way the walker faces, z to its right, on the ground plane. Each blob is a
// middle, a ring at seven tenths of its reach where it is nearly as dark and a ring at its edge where it has faded, so the
// print has no hard edge and is deepest in the middle. aSoft carries the darkness each vertex has.
export const BLOBS = [
  { x: -0.05, z: 0, rx: 0.28, rz: 0.26 }, // the pad
  { x: 0.29, z: -0.18, rx: 0.1, rz: 0.085 }, // three toes
  { x: 0.33, z: 0, rx: 0.105, rz: 0.09 },
  { x: 0.29, z: 0.18, rx: 0.1, rz: 0.085 },
];
const SEGMENTS = 12;

function buildPrint() {
  const positions = [];
  const soft = [];
  const index = [];
  for (const { x, z, rx, rz } of BLOBS) {
    const middle = positions.length / 3;
    positions.push(x, 0, z);
    soft.push(1);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      positions.push(x + Math.cos(a) * rx * 0.7, 0, z + Math.sin(a) * rz * 0.7); // inner ring
      soft.push(0.85);
      positions.push(x + Math.cos(a) * rx, 0, z + Math.sin(a) * rz); // outer ring
      soft.push(0);
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const inner = middle + 1 + 2 * i;
      const outer = inner + 1;
      const nextInner = middle + 1 + 2 * ((i + 1) % SEGMENTS);
      const nextOuter = nextInner + 1;
      index.push(middle, nextInner, inner); // wound to face up
      index.push(inner, nextInner, outer, outer, nextInner, nextOuter);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSoft', new THREE.Float32BufferAttribute(soft, 1));
  geometry.setIndex(index);
  return geometry;
}

const VERT = /* glsl */`
attribute float aSoft;
attribute float aBorn; // the game time its foot came down
uniform float uTime;
varying float vDark;
float smooth01(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec4 view = viewMatrix * world;
  gl_Position = projectionMatrix * view;
  float age = uTime - aBorn;
  float level = step(0.0, age) * min(1.0, age / ${PRESS.toFixed(3)}) * (1.0 - smooth01(${LIFE.toFixed(1)}, ${(LIFE + FADE).toFixed(1)}, age));
  vDark = aSoft * level * (1.0 - smooth01(${NEAR.toFixed(1)}, ${FAR.toFixed(1)}, -view.z));
}`;

const FRAG = /* glsl */`
uniform vec3 uTint;
varying float vDark;
void main() {
  // Premultiplied for multiply blending: the soil under it ends as soil * mix(1, tint, dark).
  gl_FragColor = vec4(uTint * vDark, vDark);
}`;

/**
 * Prints for `actor`'s feet: `feet` is a list of { bone, size, ahead } (the bone's name in actor.model, the print's size
 * as a share of its own, metres along the way it faces from under the bone). Returns
 *   mesh       the instanced mesh, in world.scene
 *   prints     the prints still to be seen: [{ x, z, born, bone }]
 *   update()   look at the feet and age the prints (world.effects does it every frame)
 *   dispose()
 */
export function createFootprints(world, { actor, feet, max = 48 } = {}) {
  if (!actor?.model || !actor?.root) throw new TypeError('Footprints need an actor whose feet they follow');
  if (!Array.isArray(feet) || !feet.length) throw new TypeError('Footprints need the feet to follow: [{ bone, size, ahead }]');
  if (world.effects && !world.clock) throw new Error('Footprints run on world.effects, so they need world.clock (engine/clock.js)');
  const tracked = feet.map(({ bone, size = 1, ahead = 0 }) => {
    const node = actor.model.getObjectByName(bone);
    if (!node) throw new Error(`${actor.name ?? 'The walker'} has no bone named ${bone}`);
    return { bone, node, size, ahead, rest: 0, down: true };
  });

  const geometry = buildPrint();
  const born = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-1e6), 1);
  geometry.setAttribute('aBorn', born);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Vector3(...TINT) } },
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.name = 'footprints';
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = 'Footprints';
  mesh.count = 0;
  mesh.frustumCulled = false; // the prints lie all along a path
  mesh.renderOrder = 1; // after the ground they darken
  world.scene?.add(mesh);

  const p = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const ground = (x, z) => world.heightAt?.(x, z) ?? 0;
  const lift = foot => {
    foot.node.getWorldPosition(p);
    return p.y - ground(p.x, p.z);
  };
  actor.root.updateMatrixWorld(true);
  for (const foot of tracked) foot.rest = lift(foot);

  const prints = []; // { x, z, born, bone, slot }
  let stamped = 0;
  let disposed = false;

  function press(foot, time) {
    foot.node.getWorldPosition(p);
    forward.set(1, 0, 0).applyQuaternion(actor.root.quaternion).setY(0).normalize();
    const x = p.x + forward.x * foot.ahead;
    const z = p.z + forward.z * foot.ahead;
    const y = ground(x, z);
    normal.set(ground(x - 0.3, z) - ground(x + 0.3, z), 0.6, ground(x, z - 0.3) - ground(x, z + 0.3)).normalize();
    turn.setFromAxisAngle(UP, -Math.atan2(forward.z, forward.x));
    tilt.setFromUnitVectors(UP, normal).multiply(turn);
    matrix.compose(new THREE.Vector3(x, y + LIFT, z), tilt, new THREE.Vector3(foot.size, 1, foot.size));
    const slot = stamped % max;
    stamped++;
    mesh.setMatrixAt(slot, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    born.array[slot] = time;
    born.needsUpdate = true;
    mesh.count = Math.min(stamped, max);
    const old = prints.findIndex(print => print.slot === slot);
    if (old >= 0) prints.splice(old, 1);
    prints.push({ x, z, born: time, bone: foot.bone, slot });
  }

  function update() {
    if (disposed) return;
    const time = world.clock?.time ?? 0;
    for (const foot of tracked) {
      const up = lift(foot) - foot.rest;
      if (foot.down && up > RISE) foot.down = false;
      else if (!foot.down && up < LAND) {
        foot.down = true;
        press(foot, time);
      }
    }
    material.uniforms.uTime.value = time;
    for (let i = prints.length - 1; i >= 0; i--) if (time - prints[i].born > LIFE + FADE) prints.splice(i, 1);
  }

  world.effects?.add({
    update() {
      update();
      return !disposed;
    },
  });

  return {
    mesh,
    prints,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.dispose(); // the instance matrices' GPU buffer, as critters.js does (the born times are the geometry's)
      geometry.dispose();
      material.dispose();
      prints.length = 0;
    },
  };
}
