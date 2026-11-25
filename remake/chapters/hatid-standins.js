// Stand-ins for the party's measurement (the plan's Task 6): what the polished party will add round the eight, so the widest shot is
// measured against the tablet's budget before anything is polished. Only on `?gestir=<n>` (the measurement and the owner's stills);
// the chapter, the tile and their videos never have them. Task 8 brought the real guests (hatid-guests.js, on the top always), so
// the stand-ins are now only the light points; Task 13 brings the real floor and stage lights in their place.
//
//   lights   600 light points (engine/show/lights.js, one draw call): the floor's glow flowers and strings over the stage
//
//   const n = standInsAsked();                          // null without ?gestir
//   const standIns = await loadStandIns(world, top, n); // { update(beat, camera), dispose() }
import * as THREE from 'three';
import { createLightPoints } from '../engine/show/lights.js';
import { BEARING, FLOOR, STAGE } from './hatid-route.js';
import { pulseAt } from './hatid-score.js';

export const STANDINS = { lights: 600 };
const deg = Math.PI / 180;

/** Asked for by the page (?gestir=<n>; the number is no longer read: the guests are real), or null: no stand-ins. */
export function standInsAsked() {
  const asked = new URLSearchParams(globalThis.location?.search ?? '').get('gestir');
  return asked === null ? null : Math.max(0, Math.round(Number(asked)) || 0);
}

/** The light points on `top` (a createTop). */
export async function loadStandIns(world, top) {
  const lights = createLightPoints(world, { capacity: STANDINS.lights, name: 'Hátíð stand-in lights' });
  const spots = [];
  const floorCount = Math.min(FLOOR.count, STANDINS.lights);
  for (let i = 0; i < floorCount; i++) {
    // the glow flowers: a sunflower spiral over the dance floor
    const r = FLOOR.radius * Math.sqrt((i + 0.5) / floorCount), a = i * 2.39996;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    spots.push([x, top.heightAt(x, z) + 0.35, z, 0.6, i]);
  }
  for (let i = floorCount; i < STANDINS.lights; i++) {
    // strings of lights in three arcs over the stage
    const k = i - floorCount, rows = 3, per = Math.ceil((STANDINS.lights - floorCount) / rows);
    const row = Math.floor(k / per), u = (k % per) / (per - 1);
    const b = BEARING.stage + (u - 0.5) * STAGE.arc;
    const r = STAGE.radius + 2 + row * 2;
    const [cx, cz] = STAGE.centre;
    const x = cx + Math.cos(b * deg) * r, z = cz + Math.sin(b * deg) * r;
    spots.push([x, top.heightAt(x, z) + 5 + row * 1.5 + Math.sin(u * Math.PI) * 2, z, 0.45, i]);
  }
  const colour = new THREE.Color();
  const update = beat => {
    lights.begin();
    const pulse = pulseAt(beat);
    for (const [x, y, z, size, i] of spots) {
      colour.setHSL((i * 0.137) % 1, 0.8, 0.6);
      lights.add(x, y, z, size, colour.r, colour.g, colour.b, 0.5 + 0.4 * pulse, 0);
    }
    lights.end();
  };
  update(0);
  return { lights: spots.length, update, dispose() { lights.dispose(); } };
}
