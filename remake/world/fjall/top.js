// The mountain's top (chapter 6, scene 7, and the festival's stage: "Sléttur og víður"): flat and wide within FJALL.top.radius, its
// ground between 0 and 3 m there, falling away past it into the sea of cloud, which lies flat at FJALL.top.sea. In grey the sea is a
// flat light disc (the cloud cards of the real look come in a later chunk: spec 8 "Skýjahafið").
//
//   const top = createTop(world, { grey, seed, radius })   -> { group, heightAt(x, z), sea, update(dt, time), dispose() }
import * as THREE from 'three';
import { GREY } from '../ardalur/terrain.js';
import { FJALL, groundMesh, smooth } from './index.js';

const SHOULDER = 50; // metres past the flat over which the ground falls to under the sea
const SEA = { radius: 2500, colour: GREY.snag };

export function createTop(world, { grey = false, seed = 6, radius = FJALL.top.radius } = {}) {
  const s = seed * 0.37;
  const flat = (x, z) => 1.2 + 0.45 * Math.sin(x * 0.07 + s) * Math.sin(z * 0.06 - s) + 0.25 * Math.sin((x + z) * 0.13 + s * 2);
  const heightAt = (x, z) => {
    const out = Math.hypot(x, z) - radius;
    return out <= 0 ? flat(x, z) : flat(x, z) - (1.2 - FJALL.top.sea + 6) * smooth(out / SHOULDER);
  };
  const group = new THREE.Group();
  group.name = 'Fjall: the top';
  const ground = groundMesh(heightAt, { radius: radius + SHOULDER + 10, step: 2.5, colour: GREY.ground, name: 'Top ground' });
  group.add(ground.mesh);
  const seaGeometry = new THREE.CircleGeometry(SEA.radius, 64).rotateX(-Math.PI / 2);
  const seaMaterial = new THREE.MeshLambertMaterial({ color: SEA.colour });
  seaMaterial.name = 'fjall-sea';
  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  sea.name = 'Sea of cloud (grey)';
  sea.position.y = FJALL.top.sea;
  group.add(sea);
  world.scene?.add?.(group); // a place adds itself, as Árdalurinn does (world/ardalur/index.js)
  return {
    group, heightAt, sea, grey,
    update() {},
    dispose() {
      ground.dispose();
      seaGeometry.dispose(); seaMaterial.dispose();
      group.removeFromParent();
    },
  };
}
