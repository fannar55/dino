// The mountain's stages' shared pieces (world/fjall): a stage's ground mesh and the small helpers its paint and its plants use.
import * as THREE from 'three';
import { GREY } from '../ardalur/terrain.js';

/** Where the mountain is: its ridge (where Grameðla walked in chapter 4: far-land.js), and the top's flat and the sea of cloud's level. */
export const FJALL = { ridge: [-2578, 120], top: { radius: 45, sea: -7 } };

/**
 * A stage's ground: one mesh, a grid of `step` m cells over the disc of `radius` round `centre`, its heights from `heightAt`, in
 * `colour` (grey: GREY.ground), or painted: `paint(x, z, y, ny) -> [r, g, b, rock]` (linear colour, and its share of bare rock) a
 * vertex, drawn with `material` (world/ardalur/look.js createGroundMaterial, which reads the colours and aRock; not disposed here).
 * It takes the sun's shadow.
 */
export function groundMesh(heightAt, { centre = [0, 0], radius, step = 2, colour = GREY.ground, name = 'Ground', paint = null, material: given = null }) {
  const n = Math.ceil((radius * 2) / step);
  const [cx, cz] = centre;
  const pos = [], index = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = cx - radius + i * step, z = cz - radius + j * step;
      pos.push(x, heightAt(x, z), z);
    }
  }
  const at = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = cx - radius + (i + 0.5) * step, z = cz - radius + (j + 0.5) * step;
      if (Math.hypot(x - cx, z - cz) > radius + step) continue;
      index.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  if (paint && given) {
    const normals = geometry.attributes.normal.array;
    const count = pos.length / 3;
    const col = new Float32Array(count * 3), rock = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const [r, g, b, k] = paint(pos[i * 3], pos[i * 3 + 2], pos[i * 3 + 1], normals[i * 3 + 1]);
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; rock[i] = k;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.setAttribute('aRock', new THREE.BufferAttribute(rock, 1));
  }
  const own = paint && given ? null : new THREE.MeshLambertMaterial({ color: colour });
  if (own) own.name = `fjall-${name.toLowerCase().replace(/\W+/g, '-')}`;
  const mesh = new THREE.Mesh(geometry, own ?? given);
  mesh.name = name;
  mesh.receiveShadow = true;
  return { mesh, dispose() { geometry.dispose(); own?.dispose(); } };
}

/** A linear colour from a hex (three's colour management: hex in, linear out), and a mix of two. */
export const linear = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mixRGB = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** Low, smooth noise of the ground (0 to 1), for patches of colour in its vertices. */
export const patchAt = (x, z, s = 0) => 0.5 + 0.25 * Math.sin(x * 0.047 + 1.3 + s) * Math.sin(z * 0.039 - 0.7 + s) + 0.25 * Math.sin(x * 0.11 - z * 0.083 + 2.1 + s * 2);
/** A small seeded random: rng() 0 to 1. */
export function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
