import * as THREE from 'three';
import { createActor } from '../actor.js';
import { createThorsedlaLod } from './thorsedla-lod.js';

// Friends from chapter 1 who come to watch (spec section 4, "Bakgrunnur"): Uggeðla stands in the grass behind the bottom tier
// and follows the game with her head, and Flugeðla glides in long loops over the board, flapping now and then. Neither is
// ever a piece (the pieces are Mosi, Kambeðla, Slóeðla, Grameðla and a little Þórseðla). Both draw with the light levels
// (thorsedla-lod.js): far away, they cost little.
//
//   const friends = await createFriends(world, board)
//   friends.lookAt(point), friends.cheer(), friends.calm, friends.update(dt), friends.dispose()

const url = name => new URL(`../../assets/characters/${name}.glb`, import.meta.url).href;
/** Where Uggeðla watches from (world.js keeps the forest's plants off it). */
export const UGGEDLA_SPOT = Object.freeze({ x: -28.6, z: -9.5, heading: 35 });
const FLIGHT = { centre: [0, 27.5, -17], radius: [25, 2.5, 6], seconds: 46, size: 0.8 };

export async function createFriends(world, board) {
  const own = Object.create(world);
  own.renderer = null;
  const lod = createThorsedlaLod(world.lighting?.sun);

  // Uggeðla, in the grass beside the board's left end, by the start, turned toward the board and the camera (she stood behind the
  // bottom tier, where the close view on a piece put her right behind it: the owner's look at Task 3's demos)
  const { x: ux, z: uz, heading: uh } = UGGEDLA_SPOT;
  own.heightAt = (x, z) => world.heightAt(x, z);
  const uggedla = await createActor(own, { name: 'friend-uggedla', url: url('spinosaurus'), position: [ux, 0, uz], heading: uh });
  uggedla.root.scale.setScalar(0.5);
  uggedla.place(ux, uz, uh);
  lod.add(uggedla);

  // Flugeðla, gliding round
  const flugedla = await createActor(own, { name: 'friend-flugedla', url: url('pteranodon'), position: [0, 0, 0], heading: 0 });
  flugedla.root.scale.setScalar(FLIGHT.size);
  lod.add(flugedla);
  let phase = Math.random(), flapping = false, flapUntil = 0, cheerUntil = 0, time = 0, calm = false;
  const at = new THREE.Vector3(), ahead = new THREE.Vector3();
  const flightPoint = (u, out) => out.set(
    FLIGHT.centre[0] + Math.cos(u * Math.PI * 2) * FLIGHT.radius[0],
    FLIGHT.centre[1] + Math.sin(u * Math.PI * 4) * FLIGHT.radius[1],
    FLIGHT.centre[2] + Math.sin(u * Math.PI * 2) * FLIGHT.radius[2],
  );
  flugedla.control(() => {
    flightPoint(phase, at);
    flightPoint(phase + 0.002, ahead);
    flugedla.root.position.copy(at);
    const heading = Math.atan2(ahead.z - at.z, ahead.x - at.x);
    flugedla.root.rotation.set(0, -heading, 0);
    // she banks into the turn and tips with the climb
    flugedla.root.rotateX(-0.35 * Math.cos(phase * Math.PI * 2));
    flugedla.root.rotateZ(Math.atan2(ahead.y - at.y, Math.hypot(ahead.x - at.x, ahead.z - at.z)) * 0.8);
  });
  flugedla.play('glide', { fade: 0 });

  return {
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    lookAt(point) { uggedla.lookAt(point, { weight: 0.65, maxAngle: 60, maxPitch: 35 }); },
    cheer() {
      if (calm) return;
      uggedla.play('happy', { fade: 0.25 });
      flapping = true; flapUntil = time + 4;
      flugedla.play('fly', { fade: 0.3 });
      cheerUntil = time + 2.6;
    },
    update(dt) {
      time += dt;
      phase = (phase + dt / (calm ? FLIGHT.seconds * 1.5 : FLIGHT.seconds)) % 1;
      // a few wing beats while she climbs, a glide the rest of the loop
      const climbing = Math.cos(phase * Math.PI * 4) > 0.55;
      const wantFlap = (climbing && !calm) || time < flapUntil;
      if (wantFlap !== flapping) { flapping = wantFlap; flugedla.play(flapping ? 'fly' : 'glide', { fade: 0.6 }); }
      if (cheerUntil && time > cheerUntil) { cheerUntil = 0; uggedla.play('idle', { fade: 0.5 }); }
      uggedla.update(dt);
      flugedla.update(dt);
      if (world.camera && world.renderer) lod.update(world.camera, world.renderer.domElement.height);
    },
    ready: () => lod.ready(),
    dispose() { uggedla.dispose(); flugedla.dispose(); },
  };
}
