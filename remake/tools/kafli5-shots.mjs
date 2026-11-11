#!/usr/bin/env node
// Chapter 5's shots as numbers, for whoever places a camera at the far pool: where everyone is, and for each shot how far it stands
// from what it looks at, how high over the ground and the water, how far down it looks and how far the sun is off its axis
// (STYLE.md sections 5 and 8; tests/kafli5-pool.test.mjs holds the limits).
//
//   node --import ./remake/tests/setup.mjs remake/tools/kafli5-shots.mjs [shot ...]
import { CHOIR, SHOTS, SPOTS, STEPS, WADE } from '../chapters/kafli5-pool.js';
import { FAR_POOL } from '../chapters/kafli4-route.js';
import { LOOKS } from '../engine/looks.js';

const polar = ([x, z]) => {
  const dx = x - FAR_POOL.center[0], dz = z - FAR_POOL.center[1];
  return `${((Math.atan2(dz, dx) * 180) / Math.PI + 360) % 360 | 0} deg, ${Math.hypot(dx, dz).toFixed(1)} m`;
};
const f = v => v.toFixed(1);
console.log(`pool: centre ${FAR_POOL.center.map(f)}, water ${FAR_POOL.level} m, radius ${FAR_POOL.radius ?? '?'}; sun azimuth ${LOOKS.goldenAfternoon.sun.azimuth}, ${LOOKS.goldenAfternoon.sun.elevation} up`);
for (const [group, spot] of Object.entries(CHOIR)) console.log(`  ${group.padEnd(8)} at ${spot.at.map(f)} (${polar(spot.at)}), faces ${spot.heading.toFixed(0)}, tap radius ${spot.radius}, on ${spot.on}`);
console.log(`  her wade at ${WADE.at.map(f)} (${polar(WADE.at)}), faces ${WADE.heading.toFixed(0)}; her last step ${STEPS.at(-1).at.map(f)}`);
for (const [who, at] of Object.entries(SPOTS)) console.log(`  ${who.padEnd(8)} at ${at.map(f)} (${polar(at)})`);
console.log(`  far reed ${FAR_POOL.farReed.map(f)} (${polar(FAR_POOL.farReed)}); Flugeðla lands ${FAR_POOL.landing.map(f)} (${polar(FAR_POOL.landing)})`);
const wanted = process.argv.slice(2);
for (const [name, shot] of Object.entries(SHOTS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const [x, y, z] = shot.position, [tx, ty, tz] = shot.target;
  const flat = Math.hypot(tx - x, tz - z);
  const heading = ((Math.atan2(tz - z, tx - x) * 180) / Math.PI + 360) % 360;
  const off = Math.abs(((heading - LOOKS.goldenAfternoon.sun.azimuth + 540) % 360) - 180);
  console.log(`${name.padEnd(16)} from (${polar([x, z])}, ${f(y - FAR_POOL.level)} m over the water) to (${polar([tx, tz])}): ${f(flat)} m away, heading ${heading.toFixed(0)}, ${((Math.atan2(y - ty, flat) * 180) / Math.PI).toFixed(0)} down, lens ${shot.fov}, sun ${off.toFixed(0)} off`);
}
