// The belt of cloud on the mountain's side (chapter 6, scenes 4 to 6: "Skýin utan í fjallinu"): bare ground that rises gently along
// the prints (+X), the giant's prints in it (world/props/mud-prints.js) and the cloud (cloud.js), centred on the stage. Its ground
// lies between 0 and 3 m everywhere the cloud reaches, so a camera's height over it reads the same to the fog everywhere (the fog
// thins with height above y 0: engine/fog.js).
//
//   const belt = createBelt(world, { grey, seed, prints, printSize })   // prints: [{ position: [x, z], heading, foot }]
//   belt.cloud, belt.prints (createMudPrints's, null with no prints), belt.heightAt(x, z), belt.update(dt, time), belt.dispose()
import { GREY } from '../ardalur/terrain.js';
import { createMudPrints } from '../props/mud-prints.js';
import { createCloud } from './cloud.js';
import { groundMesh } from './index.js';
import * as THREE from 'three';

export const BELT = { radius: 90, cloud: 60 }; // the ground's reach (past where the cloud hides it), the cloud's

/** The belt's ground: 0.2 m low at the west, rising gently east along the prints to 2.8 m, with a slight swell. */
export function beltHeight(x, z) {
  return 1.5 + 1.3 * Math.tanh((x - 25) / 35) + 0.15 * Math.sin(x * 0.21 + 0.4) * Math.sin(z * 0.17 + 1.1);
}

export function createBelt(world, { grey = false, seed = 6, prints = [], printSize = 5 } = {}) {
  const heightAt = (x, z) => beltHeight(x, z);
  const group = new THREE.Group();
  group.name = 'Fjall: the belt of cloud';
  const ground = groundMesh(heightAt, { radius: BELT.radius, step: 2, colour: GREY.ground, name: 'Belt ground' });
  group.add(ground.mesh);
  const cloud = createCloud(world, { centre: [0, 0], radius: BELT.cloud, heightAt, seed });
  group.add(cloud.group);
  const marks = prints.length ? createMudPrints(world, { prints, heightAt, seed, size: printSize }) : null;
  if (marks) group.add(marks.group); // with the place: hidden while another one shows
  return {
    group, heightAt, cloud, prints: marks, grey,
    update(dt, time) { cloud.update(dt, time); },
    dispose() {
      marks?.dispose();
      cloud.dispose();
      ground.dispose();
      group.removeFromParent();
    },
  };
}
