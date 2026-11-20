// Uggeðla í tjörninni, step 2: the show's numbers at the frame that stands (tools/tjorn3d-probe.mjs --show walks the timeline and
// asks at every step). Everything in the table's cm.
//
//   box        the picture's reach on the table of everything that stands over the surface, both eyes', by who it is. The eyes
//              are where the seat puts them whatever the screen's size, so the same boxes give the margins of every screen.
//   top        the highest point, whose it is, and its parallax
//   clear      nothing passes through another: the least distance from any point of the butterfly, of the fish in the air, of the
//              fish under the water (each fish, and which is nearest) to any point of her skin; where her skin cuts the surface
//              (and the leaping fish's) against the lilies' pads; the fish against each other; and which of the animals has a
//              point INSIDE her (a line straight up and one straight down from it both cross her skin an odd number of times)
//   strike     how far the tip of her snout is from the point it reaches for, and from the fish's middle
import * as THREE from 'three';
import { outlineBox, parallaxAt } from '../../engine/table3d.js';
import { verticesOf } from './cast.js';

const NEAR_HER = 3; // cm: an animal farther than this from the box round her is that far away at least (its points are not gone through)
const AT_SURFACE = 0.2; // cm: her skin within this of the surface is where she cuts it
const DROP_REACH = 0.12; // cm: a drop's bright heart round its middle
const r3 = x => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

export function createShowMeasure({ S, LEVEL, seat, stage, her, rig, skin, part, cloud, cast, show, snout, lilyParts, lilyPoints, strikePoint, view }) {
  const head = rig.bones.Head;
  // the tip of her snout in her head's own frame (the rig's, read while no look turns her head)
  her.update(1e-3);
  head.updateWorldMatrix(true, false);
  const snoutTip = head.worldToLocal(rig.tip.clone());
  const index = skin.geometry.index.array;
  const v = new THREE.Vector3();

  /** The points of a list (x, y in the world, z) that are over the surface: x, metres over it, z. */
  const over = (points, own = false) => {
    const out = [];
    for (let i = 0; i < points.length; i += 3) { const y = own ? points[i + 1] : points[i + 1] - LEVEL; if (y > 0) out.push(points[i], y, points[i + 2]); }
    return out;
  };
  const boxOf = (points, reach = 0) => {
    if (!points.length) return null;
    const b = outlineBox([points], [stage.eyes.left, stage.eyes.right], [0, 0]);
    return { x0: r3(b.x0 / S - reach), x1: r3(b.x1 / S + reach), z0: r3(b.z0 / S - reach), z1: r3(b.z1 / S + reach), top: r3(b.top / S) };
  };
  const bounds = (points, own = false) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i], y = own ? points[i + 1] : points[i + 1] - LEVEL, z = points[i + 2];
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z;
      if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
    }
    return b;
  };
  const boxesApart = (a, b) => Math.hypot(...[0, 1, 2].map(k => Math.max(0, a[k] - b[k + 3], b[k] - a[k + 3])));
  /** The least distance (cm) from any of `points` (world) to any point of her skin (`mine`: x, y over the surface, z). */
  function apart(points, mine, mineBounds) {
    const far = boxesApart(bounds(points), mineBounds) / S;
    if (far > NEAR_HER) return { cm: r3(far), atLeast: true };
    let least = Infinity;
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i], y = points[i + 1] - LEVEL, z = points[i + 2];
      for (let j = 0; j < mine.length; j += 3) {
        const d = (x - mine[j]) ** 2 + (y - mine[j + 1]) ** 2 + (z - mine[j + 2]) ** 2;
        if (d < least) least = d;
      }
    }
    return { cm: r3(Math.sqrt(least) / S), atLeast: false };
  }
  /** Whether the point (world) is inside her skin: the crossings of the line straight up from it, and straight down, are both odd. */
  function inside(x, y, z, mine) {
    let up = 0, down = 0;
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
      const ax = mine[a] - x, az = mine[a + 2] - z, bx = mine[b] - x, bz = mine[b + 2] - z, cx = mine[c] - x, cz = mine[c + 2] - z;
      const d1 = ax * bz - az * bx, d2 = bx * cz - bz * cx, d3 = cx * az - cz * ax;
      if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
      const sum = d1 + d2 + d3;
      if (Math.abs(sum) < 1e-12) continue;
      const at = (d2 * mine[a + 1] + d3 * mine[b + 1] + d1 * mine[c + 1]) / sum;
      if (at > y - LEVEL) up++; else down++;
    }
    return up % 2 === 1 && down % 2 === 1;
  }
  /** Whether any of a few points of an animal (its middle and six of its own points) is inside her. */
  function anyInside(points, mine, mineBounds) {
    if (boxesApart(bounds(points), mineBounds) > 0) return false;
    const n = points.length / 3;
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < points.length; i += 3) { mx += points[i]; my += points[i + 1]; mz += points[i + 2]; }
    if (inside(mx / n, my / n, mz / n, mine)) return true;
    for (let k = 0; k < 6; k++) { const i = Math.floor((k + 0.5) * n / 6) * 3; if (inside(points[i], points[i + 1], points[i + 2], mine)) return true; }
    return false;
  }
  // the lilies' pads and flowers on the water, as triangles [x, z] three times (m), each lily with the circle they lie in
  const lilies = lilyParts.map(l => {
    const triangles = [...l.pads, ...l.flowers];
    let x = 0, z = 0;
    for (const t of triangles) { x += t[0] + t[2] + t[4]; z += t[1] + t[3] + t[5]; }
    x /= 3 * triangles.length; z /= 3 * triangles.length;
    let reach = 0;
    for (const t of triangles) for (let k = 0; k < 6; k += 2) reach = Math.max(reach, Math.hypot(t[k] - x, t[k + 1] - z));
    return { triangles, x, z, reach };
  });
  const toSegment = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const u = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(px - ax - u * dx, pz - az - u * dz);
  };
  /** The least distance on the water (cm) from where a thing cuts the surface (its points near it: x, y over it, z) to a lily's pads; 0: on one. */
  function toPads(points) {
    let least = Infinity;
    for (let i = 0; i < points.length; i += 3) {
      if (Math.abs(points[i + 1]) > AT_SURFACE * S) continue;
      const x = points[i], z = points[i + 2];
      for (const l of lilies) {
        const off = Math.hypot(x - l.x, z - l.z) - l.reach;
        if (off > least) continue;
        if (off > 0.5 * S) { least = Math.min(least, off); continue; }
        for (const t of l.triangles) {
          const d1 = (x - t[2]) * (t[1] - t[3]) - (t[0] - t[2]) * (z - t[3]);
          const d2 = (x - t[4]) * (t[3] - t[5]) - (t[2] - t[4]) * (z - t[5]);
          const d3 = (x - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (z - t[1]);
          if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return 0;
          least = Math.min(least, toSegment(x, z, t[0], t[1], t[2], t[3]), toSegment(x, z, t[2], t[3], t[4], t[5]), toSegment(x, z, t[4], t[5], t[0], t[1]));
        }
      }
    }
    return r3(least / S);
  }
  const lilyBox = boxOf(over(lilyPoints, true));

  return function measure() {
    const t = show.state.t;
    const there = her.root.visible;
    const mine = there ? cloud() : new Float32Array(0);
    const mineBounds = bounds(mine, true);
    const held = rig.fish.group.visible ? verticesOf(rig.fish.group) : [];
    const jumper = cast.jumper.group.visible ? verticesOf(cast.jumper.group) : [];
    const butterfly = cast.butterfly.loaded && cast.butterfly.group.visible ? verticesOf(cast.butterfly.group) : [];
    const frog = cast.frog.loaded ? verticesOf(cast.frog.group) : [];
    const fish = cast.fish.map(f => (f.group.visible ? verticesOf(f.group) : []));

    // ---- the picture over the surface ----
    const groups = { her: over(mine, true), held: over(held), fish: over(jumper), frog: over(frog), butterfly: over(butterfly), drops: over(show.drops) };
    const box = Object.fromEntries(Object.entries(groups).map(([name, points]) => [name, boxOf(points, name === 'drops' ? DROP_REACH : 0)]));
    box.lilies = lilyBox;
    let top = null;
    for (const [of, b] of Object.entries(box)) if (b && (!top || b.top > top.cm)) top = { of, cm: b.top };
    if (top) top.parallaxCm = r3(parallaxAt(top.cm, stage.eyes.height, seat.ipd));
    let headTop = -Infinity, herTop = -Infinity, low = Infinity;
    for (let i = 0, k = 0; i < mine.length; i += 3, k++) {
      if (mine[i + 1] > herTop) herTop = mine[i + 1];
      if (mine[i + 1] < low) low = mine[i + 1];
      if (part[k] === 1 && mine[i + 1] > headTop) headTop = mine[i + 1];
    }

    // ---- nothing through another ----
    const clear = { butterflyCm: null, airFishCm: null, fishCm: null, fishOf: null, padsCm: null, jumperPadsCm: null, fishApartCm: null, inside: [] };
    if (there) {
      if (butterfly.length) {
        clear.butterflyCm = apart(butterfly, mine, mineBounds).cm;
        if (anyInside(butterfly, mine, mineBounds)) clear.inside.push('butterfly');
      }
      if (jumper.length) {
        const d = apart(jumper, mine, mineBounds).cm;
        if (show.state.air) clear.airFishCm = d;
        else if (clear.fishCm === null || d < clear.fishCm) { clear.fishCm = d; clear.fishOf = 'jumper'; }
        if (anyInside(jumper, mine, mineBounds)) clear.inside.push('jumper');
      }
      fish.forEach((points, i) => {
        if (!points.length) return;
        const d = apart(points, mine, mineBounds).cm;
        if (clear.fishCm === null || d < clear.fishCm) { clear.fishCm = d; clear.fishOf = i; }
        if (anyInside(points, mine, mineBounds)) clear.inside.push(`fish ${i}`);
      });
      clear.padsCm = toPads(mine);
    }
    if (jumper.length) clear.jumperPadsCm = toPads(jumper.map((x, i) => (i % 3 === 1 ? x - LEVEL : x)));
    // the fish against each other (the leaping one too, while it is in the water)
    const swimmers = [...fish, show.state.air ? [] : jumper].filter(points => points.length);
    for (let a = 0; a < swimmers.length; a++) {
      for (let b = a + 1; b < swimmers.length; b++) {
        const A = swimmers[a], B = swimmers[b];
        let d = boxesApart(bounds(A), bounds(B));
        if (d < 1 * S) {
          d = Infinity;
          for (let i = 0; i < A.length; i += 3) for (let j = 0; j < B.length; j += 3) d = Math.min(d, (A[i] - B[j]) ** 2 + (A[i + 1] - B[j + 1]) ** 2 + (A[i + 2] - B[j + 2]) ** 2);
          d = Math.sqrt(d);
        }
        if (clear.fishApartCm === null || d / S < clear.fishApartCm) clear.fishApartCm = r3(d / S);
      }
    }

    // ---- her snout and what it reaches for ----
    head.updateWorldMatrix(true, false);
    head.localToWorld(v.copy(snoutTip));
    const tip = [r3(v.x / S), r3((v.y - LEVEL) / S), r3(v.z / S)];
    const strike = rig.target ? { weight: r3(rig.v.strike), rigErrorCm: r3(rig.error / S), tipToTargetCm: r3(v.distanceTo(strikePoint) / S) } : null;
    let tipToFishCm = null;
    if (jumper.length) {
      const b = bounds(jumper);
      tipToFishCm = r3(Math.hypot(v.x - (b[0] + b[3]) / 2, v.y - LEVEL - (b[1] + b[4]) / 2, v.z - (b[2] + b[5]) / 2) / S);
    }

    return {
      t: r3(t), part: view.key?.name ?? null, vertices: mine.length / 3,
      box, top,
      her: there ? { sinkCm: r3(rig.v.sink / S), headCm: r3(headTop / S), topCm: r3(herTop / S), lowCm: r3(low / S), tip, jaw: r3(rig.v.jaw) } : null,
      butterfly: { on: show.state.onSnout ? 'snout' : show.state.flying ? 'air' : 'lily', sits: show.state.onSnout ? snout.report(true) : null },
      strike, tipToFishCm,
      clear,
      drops: show.state.drops,
    };
  };
}
