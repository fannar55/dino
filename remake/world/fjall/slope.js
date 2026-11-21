// The mountain's slope (chapter 6, scene 3: "Fjallshlíðin"): a ledge on the path up, on the side of the ridge Grameðla walked along
// in chapter 4 (FJALL.ridge), 180 m east of its crest and 70 m below it, looking east over the whole forest. The land round it is
// the far land of chapter 4's flight (world/ardalur/far-land.js), shown, on the valley's terrain; the ledge and the path round it are
// a small stage of finer ground laid over the far land's (60 cm over it, sinking under it at the stage's rim), so the far land's
// big triangles never show through it. The cloud lies above, up the ridge (the belt: belt.js, a place of its own).
//
//   const slope = createSlope(world, { grey, route, seed })
//   slope.far (its far land, shown), slope.ledge ([x, z]), slope.heightAt(x, z), slope.update(dt, time), slope.dispose()
import * as THREE from 'three';
import { createRoute } from '../../chapters/kafli4-route.js';
import { createTerrain, GREY } from '../ardalur/terrain.js';
import { createFarLand, FAR } from '../ardalur/far-land.js';
import { FJALL, groundMesh, smooth } from './index.js';

const LEDGE = { east: 180, shelf: 12, up: 1, over: 0.6, radius: 70, rim: 20 }; // m: east of the ridge, the shelf's half width, ...

export function createSlope(world, { grey = false, route = createRoute(), seed = 4 } = {}) {
  const terrain = createTerrain(route, { seed });
  const far = createFarLand(world, route, { terrain, seed });
  far.show(true);
  const ledge = [FJALL.ridge[0] + LEDGE.east, FJALL.ridge[1]];
  const shelf = far.heightAt(...ledge) + LEDGE.up;
  // the stage: over the far land, and a level shelf round the ledge; sunk under the far land at its rim
  const heightAt = (x, z) => {
    const land = far.heightAt(x, z);
    const d = Math.hypot(x - ledge[0], z - ledge[1]);
    if (d >= LEDGE.radius) return land;
    const over = LEDGE.over - (LEDGE.over + 0.4) * smooth((d - (LEDGE.radius - LEDGE.rim)) / LEDGE.rim);
    const level = shelf - 0.04 * Math.max(0, d - LEDGE.shelf) ** 1.5;
    return Math.max(land + over, d < LEDGE.radius - LEDGE.rim ? level : -Infinity);
  };
  const group = new THREE.Group();
  group.name = 'Fjall: the slope';
  const ground = groundMesh(heightAt, { centre: ledge, radius: LEDGE.radius, step: 2, colour: GREY.ground, name: 'Slope ground' });
  group.add(ground.mesh, far.group);
  let disposed = false;
  return {
    group, heightAt, far, ledge, grey,
    update() { far.update(FAR.from, world.camera); }, // the far land shows (it is drawn in its flight's window) and the camera sees far
    dispose() {
      if (disposed) return;
      disposed = true;
      far.update(-1, world.camera); // hidden, and the camera's own far plane back
      far.dispose();
      ground.dispose();
      group.removeFromParent();
    },
  };
}
