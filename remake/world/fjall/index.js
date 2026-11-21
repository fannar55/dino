// The mountain of chapter 6 (its spec 2 and 8: "Fjallið er nýtt land"): not a whole mountain walked up but three small stages, each a
// place a chapter's location builds (engine/locations.js: `build`), with the view far off. The festival uses the top too.
//
//   createSlope(world, options)   the slope (slope.js): a ledge on the path up, on the far land of chapter 4's flight, east of the
//                                 ridge Grameðla walked along, looking east over the whole forest; the cloud above it
//   createBelt(world, options)    the belt of cloud (belt.js): bare ground under the cloud, the prints and the cloud (cloud.js)
//   createTop(world, options)     the top (top.js): flat and wide, the sea of cloud lying below it
//
// Each stands where a forest would: `group`, `heightAt(x, z)`, `update(dt, time)` (main.js calls it each frame) and `dispose()`. In
// chunk 1 they are grey: bare ground in the valley's stand-in colours (world/ardalur/terrain.js GREY), no plants and no rocks.
import * as THREE from 'three';
import { GREY } from '../ardalur/terrain.js';

/** Where the mountain is: its ridge (where Grameðla walked in chapter 4: far-land.js), and the top's flat and the sea of cloud's level. */
export const FJALL = { ridge: [-2578, 120], top: { radius: 45, sea: -7 } };

export { createSlope } from './slope.js';
export { createBelt } from './belt.js';
export { createTop } from './top.js';

/**
 * A stage's ground: one mesh, a grid of `step` m cells over the disc of `radius` round `centre`, its heights from `heightAt`, in
 * `colour` (grey: GREY.ground). It takes the sun's shadow.
 */
export function groundMesh(heightAt, { centre = [0, 0], radius, step = 2, colour = GREY.ground, name = 'Ground' }) {
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
  const material = new THREE.MeshLambertMaterial({ color: colour });
  material.name = `fjall-${name.toLowerCase().replace(/\W+/g, '-')}`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return { mesh, dispose() { geometry.dispose(); material.dispose(); } };
}

export const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
