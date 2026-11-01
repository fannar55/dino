// What the gorge hides. From down in the gorge (over its water, by the plunge pool, up the falls' face) most of the land above the
// falls cannot be seen: the walls and the cliff stand between. Seen up the gorge, its plants would be the most of what the camera's
// view draws, nearly all of it behind rock. So the plants that grow above the falls are batched on their own (sector ABOVE_SECTOR,
// banks.js), and while the camera is low the forest's cull (world/forest/batch.js: cullBatches) leaves out each one the ground
// hides, plant by plant: the trees that show over the lip, through the slot of sky at the gorge's end, stay.
//
//   aboveTheFalls(route, d) -> boolean        a plant whose nearest river point is `d` grows above the falls
//   createGorgeSight(route, terrain, index) -> {   (index: terrain.js's createRouteIndex, for where the ground is drawn)
//     active(camera) -> boolean               the camera (a position) is low enough for the test to be worth its cost
//     hidden(camera, sphere) -> boolean       the ground stands between the camera and every point at the top of the sphere (its
//                                             crown and four points round it, at its full radius): the plant inside cannot be seen
//     lipY                                    the bed of the river just over the lip, the lowest the rock gets toward the land above
//   }
//
// The ground is read where the line of sight crosses the cross-sections x = const every STEP metres between the gorge's foot and
// just past the cliff, as the ground mesh draws it (the grid's own lines: GRID, terrain.js), so a line that passes under one passes
// under the ground the player sees; it must pass under by CLEAR. Where no ground is drawn (beyond CORRIDOR of the route) nothing
// hides anything, and a line that slips between two cross-sections counts as seen.
// The test (tests/ardalur.test.mjs) checks the rule against the ground itself, sight line by sight line, all down the gorge.
import { GORGE } from '../../chapters/kafli4-route.js';
import { GRID, CORRIDOR } from './terrain.js';

export const STEP = 10; // metres between the cross-sections (a multiple of GRID)
export const CLEAR = 1; // metres a line of sight must pass under the ground by
const ABOVE = 2; // metres of river beyond the lip within which a plant does not count as above the falls
const REACH = 260; // metres either side of the falls' line (z) the cross-sections cover
export const ABOVE_SECTOR = 2; // the forest batcher merges the thin parts' sectors in pairs (0 with 1): 2 keeps them apart

export const aboveTheFalls = (route, d) => d > route.river.falls + ABOVE;

export function createGorgeSight(route, terrain, index) {
  const { river } = route;
  const falls = river.falls;
  const beyond = river.at(falls + 1);
  const lipY = terrain.heightAt(beyond.x, beyond.z);
  // the cross-sections, east to west: from the gorge's foot to a little past the cliff's face
  let east = -Infinity;
  for (let d = GORGE.from - 60; d <= falls; d += 5) east = Math.max(east, river.at(d).x);
  east = Math.ceil(east / STEP) * STEP;
  const west = Math.floor((route.falls.face - 15) / STEP) * STEP;
  const count = Math.round((east - west) / STEP) + 1;
  const z0 = Math.floor((route.falls.z - REACH) / GRID) * GRID;
  const across = Math.round((2 * REACH) / GRID) + 1;
  const heights = new Float32Array(count * across);
  const out = {};
  for (let i = 0; i < count; i++) {
    const x = east - i * STEP;
    for (let j = 0; j < across; j++) {
      const z = z0 + j * GRID;
      // drawn ground only: a grid point well inside the corridor (its cells are built: terrain.js, groundSteps)
      heights[i * across + j] = index.nearest(x, z, CORRIDOR - 2 * GRID, out) >= 0 ? terrain.heightAt(x, z) : -Infinity;
    }
  }
  /** The ground's height on cross-section i at z, as the mesh draws it (linear between the grid's points); -Infinity outside. */
  const groundOn = (i, z) => {
    const f = (z - z0) / GRID;
    const j = Math.floor(f);
    if (j < 0 || j >= across - 1) return -Infinity;
    const k = f - j;
    return heights[i * across + j] * (1 - k) + heights[i * across + j + 1] * k;
  };

  /** True when the ground hides the point (x, y, z) from the camera c: the line between them passes under a cross-section. */
  function blocked(c, x, y, z) {
    if (x >= c.x) return false; // only lines that head west, toward the cliff
    const first = Math.max(0, Math.ceil((east - c.x) / STEP + 1e-6));
    const last = Math.min(count - 1, Math.floor((east - x) / STEP - 1e-6));
    for (let i = first; i <= last; i++) {
      const k = (c.x - (east - i * STEP)) / (c.x - x);
      if (groundOn(i, c.z + (z - c.z) * k) > c.y + (y - c.y) * k + CLEAR) return true;
    }
    return false;
  }

  return {
    lipY,
    active: camera => camera.y < lipY + 4 && camera.x > west,
    hidden(camera, sphere) {
      const { x, y, z } = sphere.center;
      const r = sphere.radius;
      const top = y + r;
      return blocked(camera, x, top, z) && blocked(camera, x + r, top, z) && blocked(camera, x - r, top, z)
        && blocked(camera, x, top, z + r) && blocked(camera, x, top, z - r);
    },
  };
}
