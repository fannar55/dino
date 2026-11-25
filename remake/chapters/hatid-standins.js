// Stand-ins for the party's measurement (the plan's Task 6): what the polished party will add round the eight, so the widest shot is
// measured against the tablet's budget before anything is polished. Only on `?gestir=<n>` (the measurement and the owner's stills);
// the chapter, the tile and their videos never have them. Task 8 brings the real guests; Task 13 the real floor and stage lights.
//
//   guests   n of the valley's baked critters (world/ardalur/animals.js loadCritters, drawn by world/critters/crowd.js createCrowds),
//            in an arc near the top's rim behind the dance floor, facing the middle, each in her idle (a pure function of the beat)
//   lights   600 light points (engine/show/lights.js, one draw call): the floor's glow flowers and strings over the stage
//
//   const n = standInsAsked();                          // null without ?gestir
//   const standIns = await loadStandIns(world, top, n); // { update(beat, camera), dispose() }
import * as THREE from 'three';
import { loadCritters } from '../world/ardalur/animals.js';
import { createCrowds } from '../world/critters/crowd.js';
import { clipPose } from '../world/critters/crowd-models.js';
import { createLightPoints } from '../engine/show/lights.js';
import { BEARING, FLOOR, STAGE, floorPoint } from './hatid-route.js';
import { BEAT, pulseAt } from './hatid-score.js';

export const STANDINS = {
  guests: 23,
  ring: { radius: 39, arc: 140 }, // m from the middle; degrees round the stage's bearing (all in party_wide's frame)
  kinds: [['grasbitur', 3], ['smaedla', 2.5], ['froskur', 4.5], ['skjaldbaka', 4]], // each in turn, with her scale (life.js LIFE_SCALE)
  lights: 600,
};
const deg = Math.PI / 180;

/** The number of guests asked for (?gestir=<n>, 0 to 23), or null: no stand-ins. */
export function standInsAsked() {
  const asked = new URLSearchParams(globalThis.location?.search ?? '').get('gestir');
  if (asked === null) return null;
  return Math.max(0, Math.min(STANDINS.guests, Math.round(Number(asked)) || 0));
}

/** The guests and the light points on `top` (a createTop), placed for `count` guests. */
export async function loadStandIns(world, top, count = STANDINS.guests) {
  const critters = await loadCritters(world);
  const kinds = STANDINS.kinds.filter(([kind]) => critters[kind]);
  const crowds = createCrowds(world, { parent: world.scene, seen: 200, groundAt: (x, z) => top.heightAt(x, z) });
  const guests = [];
  for (let i = 0; i < count; i++) {
    const [kind, scale] = kinds[i % kinds.length];
    const bearing = BEARING.stage - STANDINS.ring.arc / 2 + (STANDINS.ring.arc * (i + 0.5)) / count;
    const r = STANDINS.ring.radius - (i % 2) * 2.5;
    const x = Math.cos(bearing * deg) * r, z = Math.sin(bearing * deg) * r;
    const model = critters[kind];
    const clip = model.clips?.idle ? 'idle' : Object.keys(model.clips ?? {})[0] ?? null; // a model without clips stands still
    guests.push({ kind, model, clip, scale, phase: (i * 0.37) % 1, heading: (Math.atan2(-z, -x) / deg), position: new THREE.Vector3(x, top.heightAt(x, z), z) });
  }
  const counts = new Map();
  for (const g of guests) counts.set(g.kind, (counts.get(g.kind) ?? 0) + 1);
  for (const [kind, n] of counts) crowds.reserve(kind, n, critters[kind]);
  crowds.ready();

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
  const update = (beat, camera = world.camera) => {
    crowds.begin(camera ?? null);
    for (const g of guests) crowds.place(g.kind, g.position, g.heading, g.scale, g.clip ? { morphs: clipPose(g.model, g.clip, beat * BEAT, g.phase) } : {});
    crowds.end();
    lights.begin();
    const pulse = pulseAt(beat);
    for (const [x, y, z, size, i] of spots) {
      colour.setHSL((i * 0.137) % 1, 0.8, 0.6);
      lights.add(x, y, z, size, colour.r, colour.g, colour.b, 0.5 + 0.4 * pulse, 0);
    }
    lights.end();
  };
  update(0);
  return {
    guests: guests.length,
    update,
    dispose() { crowds.dispose(); lights.dispose(); },
  };
}
