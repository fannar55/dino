// Which world a place is: the forest (the default) or the Fen (chapter 2). A layout says `biome: 'fen'`, and may say
// `blend: { from: [x, z], to: [x, z] }`: then it is forest up to `from` and fen from `to` on, mixed smoothly along the line
// between them (the trail out of the forest, which reads as one walk and not as a cut). Without `blend` a fen layout is fen
// everywhere. Every part of the forest that differs in the Fen (terrain.js, plan.js, grass.js) asks shareAt(x, z), 0 for
// forest to 1 for fen; a forest layout answers 0 everywhere and grows exactly as it always did. The shaders get the same
// share from three numbers (uniforms) and FEN_SHARE_GLSL below.
import { clamp } from './random.js';

const smooth = t => t * t * (3 - 2 * t);

export function biomeOf(layout) {
  if ((layout.biome ?? 'forest') !== 'fen') {
    return { name: 'forest', fen: false, blended: false, shareAt: () => 0, uniform: { base: 0, from: [0, 0], axis: [0, 0] } };
  }
  const blend = layout.blend;
  if (!blend) return { name: 'fen', fen: true, blended: false, shareAt: () => 1, uniform: { base: 1, from: [0, 0], axis: [0, 0] } };
  const [fx, fz] = blend.from, [tx, tz] = blend.to;
  const dx = tx - fx, dz = tz - fz;
  const l2 = dx * dx + dz * dz;
  if (!(l2 > 0)) throw new Error('layout.blend needs two different points, from and to');
  const ax = dx / l2, az = dz / l2;
  return {
    name: 'fen', fen: true, blended: true,
    shareAt: (x, z) => smooth(clamp((x - fx) * ax + (z - fz) * az, 0, 1)),
    uniform: { base: 0, from: [fx, fz], axis: [ax, az] },
  };
}

/** The fen's share in a shader: uniforms uFenBase, uFenFrom and uFenAxis (biomeOf(layout).uniform), as shareAt does it. */
export const FEN_SHARE_GLSL = /* glsl */`
uniform float uFenBase;
uniform vec2 uFenFrom;
uniform vec2 uFenAxis;
float fenShare( vec2 p ) {
  float t = clamp( uFenBase + dot( p - uFenFrom, uFenAxis ), 0.0, 1.0 );
  return t * t * ( 3.0 - 2.0 * t );
}`;

/** The uniforms FEN_SHARE_GLSL reads, for a layout's biome. */
export function fenUniforms(biome, THREE) {
  return {
    uFenBase: { value: biome.uniform.base },
    uFenFrom: { value: new THREE.Vector2(...biome.uniform.from) },
    uFenAxis: { value: new THREE.Vector2(...biome.uniform.axis) },
  };
}
