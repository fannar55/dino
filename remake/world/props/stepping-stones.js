import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { sparkleBurst } from './sparkles.js';

// The stepping stones of chapter 6's ford (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, sections 4 and 5:
// "Áin við fossinn"): five steps across the river above the falls, each with two or three stones, one of them right (big, flat and
// dry) and the others small and rocking. In chunk 1 they are grey: a flat disc each, standing out of the water by its `up` and
// going down 0.6 m under it, so it never floats whatever the river bed does. The real rocks come in chunk 2.
//
//   const stones = createSteppingStones(world, { steps: STEPS, level, sizes: STONE });   // kafli6-route.js
//   for (const t of stones.targets) ...      // { name: the stone's id, point (Vector3 over its top), radius: its tap circle }
//   stones.top(id)                           // the y of its top: where Mosi's feet go
//   stones.rock(id)                          // it rocks for ROCK.seconds; returns a Handle
//   stones.glitter(id)                       // glints rise off it for GLITTER.seconds: the help's hint (a Handle)
//   stones.dispose()
//
// Everything runs on the game clock (world.effects), so a paused game pauses it and a capture lands on the same frame. All the
// stones are one material; a disc each: at most 13 draw calls and a few hundred triangles.

const DEPTH = 0.6; // m under the water
const COLOUR = { right: '#9a978d', wrong: '#7d7a72' }; // the valley's grey stand-ins: the right one lighter (dry)
const ROCK = { seconds: 1.1, degrees: 9, swings: 2.5 };
const GLITTER = { seconds: 3, every: 0.35 };

export function createSteppingStones(world, { steps, level, sizes }) {
  const group = new THREE.Group();
  group.name = 'Stepping stones';
  const materials = { right: new THREE.MeshLambertMaterial({ color: COLOUR.right }), wrong: new THREE.MeshLambertMaterial({ color: COLOUR.wrong }) };
  materials.right.name = 'stepping-stone-right';
  materials.wrong.name = 'stepping-stone-wrong';
  const geometries = [];
  const stones = new Map(); // id -> { mesh, top, size, rocking }
  for (const step of steps) {
    for (const stone of step.stones) {
      const size = stone.right ? sizes.right : sizes.wrong;
      const height = size.up + DEPTH;
      const geometry = new THREE.CylinderGeometry(size.across / 2, size.across / 2 * 1.08, height, 20);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, stone.right ? materials.right : materials.wrong);
      mesh.name = stone.id;
      const top = level + size.up;
      mesh.position.set(stone.at[0], top - height / 2, stone.at[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      stones.set(stone.id, { mesh, top, size, rocking: null, at: stone.at });
    }
  }
  const targets = [...stones].map(([id, s]) => ({ name: id, point: new THREE.Vector3(s.at[0], s.top + 0.15, s.at[1]), radius: s.size.tap }));
  world.scene?.add?.(group);

  let disposed = false;
  const live = new Set();
  function rockAt(stone, now) {
    const r = stone.rocking;
    if (!r) return;
    const k = (now - r.from) / ROCK.seconds;
    if (k >= 1) {
      stone.mesh.rotation.set(0, 0, 0);
      stone.rocking = null;
      r.handle.finish();
      return;
    }
    const swing = Math.sin(k * Math.PI * 2 * ROCK.swings) * (1 - k) * THREE.MathUtils.degToRad(ROCK.degrees);
    stone.mesh.rotation.set(swing * 0.6, 0, swing);
  }
  const effect = {
    label: 'stepping stones',
    update() {
      if (disposed) return false;
      const now = world.clock?.time ?? 0;
      for (const stone of stones.values()) rockAt(stone, now);
      for (const g of live) {
        if (now >= g.until) { live.delete(g); g.handle.finish(); continue; }
        if (now >= g.next) {
          g.next = now + GLITTER.every;
          const [x, z] = g.stone.at;
          const turn = (now * 2.39996) % (Math.PI * 2);
          const r = g.stone.size.across * 0.3;
          sparkleBurst(world, new THREE.Vector3(x + Math.cos(turn) * r, g.stone.top + 0.08, z + Math.sin(turn) * r), { count: 10, duration: 1.1, size: 0.22, spread: 0.6, seed: `stone glitter ${g.n++ % 7}` });
        }
      }
      return true;
    },
  };
  world.effects?.add?.(effect);

  return {
    group, targets,
    top: id => stones.get(id).top,
    /** The stone rocks (a wrong tap). */
    rock(id) {
      const stone = stones.get(id);
      stone.rocking?.handle.finish();
      stone.rocking = { from: world.clock?.time ?? 0, handle: new Handle(`${id} rocks`) };
      return stone.rocking.handle;
    },
    /** Glints rise off it for a while: the right stone, as the help's hint. */
    glitter(id) {
      const now = world.clock?.time ?? 0;
      const g = { stone: stones.get(id), until: now + GLITTER.seconds, next: now, n: 0, handle: new Handle(`${id} glitters`) };
      live.add(g);
      return g.handle;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const g of live) g.handle.finish();
      live.clear();
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      materials.right.dispose();
      materials.wrong.dispose();
    },
  };
}
