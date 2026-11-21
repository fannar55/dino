// Grameðla in chapter 6 (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, sections 3, 4 and 8): her life. Chunk 1
// is a placeholder: her model (trex.glb) hidden until the call, placed, and her three clips: idle, walk (1.1 m/s) and roar. Her lean,
// her head tilt and sniff, the seat on her head and the quick march up are chunk 3's.
//
//   const her = gramedlaLife(s.actor('gramedla'))
//   her.hide() / her.show() / her.shown
//   her.place([x, z], heading)            her feet on the ground there
//   her.face(heading)                     she turns where she stands (a Handle)
//   her.walk(points, { speed })           she walks to the last of points ([x, z] each), a Handle
//   her.roar()                            her roar clip once, then idle; a Handle, done when it is over
//   her.idle()
import { Handle } from '../engine/handle.js';

/** How fast she walks (m/s), and how long her roar clip holds before she goes back to standing (s). */
export const HER = { walk: 1.1, roar: 2.6 };

export function gramedlaLife(actor) {
  const her = actor.raw;
  const world = her.world;
  let roaring = null;
  return {
    get shown() { return her.root.visible; },
    hide() { her.root.visible = false; },
    show() { her.root.visible = true; },
    place([x, z], heading) { her.place(x, z, heading); },
    face(heading) { return her.turnTo(heading, { rate: 35 }); },
    walk(points, { speed = HER.walk } = {}) { return her.walkTo(points, { speed, turnRate: 30 }); },
    idle() { her.play('idle', { fade: 0.6 }); },
    roar() {
      roaring?.finish();
      const handle = new Handle('Grameðla roars');
      roaring = handle;
      her.play('roar', { fade: 0.3, once: true });
      const from = world.clock?.time ?? 0;
      world.effects?.add({
        label: 'her roar',
        update: () => {
          if (handle.done) return false;
          if ((world.clock?.time ?? 0) - from < HER.roar) return true;
          her.play('idle', { fade: 0.6 });
          handle.finish();
          return false;
        },
      });
      if (!world.effects) handle.finish();
      return handle;
    },
  };
}
