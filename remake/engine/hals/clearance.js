import * as THREE from 'three';
import { BOARD } from './rules.js';
import { STONE, LEDGE } from './board.js';
import { shelfFor, THORSEDLA_MODEL as MODEL } from './places.js';

// A check for the lab (hals-lab.html ?look=…, or window.__clearance()): how close each Þórseðla's neck, head and tail come to
// the board (the blocks, the logs, the shelves) and to the other Þórseðlas, as they stand now. Each chain is a row of balls
// (its joints and the points between, each as thick as the chain there); the board's parts and the other bodies are boxes.
// A gap below 0 is a clash. It reports the smallest gap of each and what it is with.

const V3 = THREE.Vector3;

/** The gap between a ball and a box ({ min, max }, turned by `angle` about y round its middle if given), less than 0 inside. */
function gapToBox(p0, r, box) {
  let p = p0;
  if (box.angle) {
    // into the box's own frame: the turn three makes about y by `angle`, undone
    const c = box.centre, a = box.angle, x = p0.x - c.x, z = p0.z - c.z;
    p = new V3(c.x + x * Math.cos(a) - z * Math.sin(a), p0.y, c.z + x * Math.sin(a) + z * Math.cos(a));
  }
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
  const dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y);
  const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  const outside = Math.hypot(dx, dy, dz);
  if (outside > 0) return outside - r;
  const inside = Math.min(p.x - box.min.x, box.max.x - p.x, p.y - box.min.y, box.max.y - p.y, p.z - box.min.z, box.max.z - p.z);
  return -inside - r;
}

/** Balls along a chain [{ p, r }]: the joints and `n` points between each two. */
function balls(chain, n = 3) {
  const out = [];
  for (let i = 0; i < chain.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const u = j / n;
      out.push({ p: new V3().lerpVectors(chain[i].p, chain[i + 1].p, u), r: chain[i].r * (1 - u) + chain[i + 1].r * u });
    }
  }
  out.push(chain[chain.length - 1]);
  return out;
}

/** The boxes of the board: each tier's row of blocks and its log, and each shelf (world). */
function boardBoxes(world) {
  const boxes = [];
  const halfRow = (BOARD.columns * BOARD.spacing) / 2 + 0.2;
  for (let r = 0; r < BOARD.rows; r++) {
    const y = world.board.tierY(r);
    boxes.push({ name: `blocks ${r}`, min: new V3(-halfRow, y - STONE.height, -STONE.depth / 2), max: new V3(halfRow, y, STONE.depth / 2) });
    if (r) boxes.push({ name: `log ${r}`, min: new V3(-LEDGE.halfLength, y - STONE.height - LEDGE.thickness, -LEDGE.depth / 2), max: new V3(LEDGE.halfLength, y - STONE.height + 0.04, LEDGE.depth / 2) });
  }
  for (const place of world.places) {
    if (place.tier === 0) continue;
    const s = shelfFor(place), top = world.board.tierY(place.tier) - 0.3;
    boxes.push({ name: `${place.id}'s shelf`, owner: place.id, min: new V3(s.x0, top - 1.5, s.z0), max: new V3(s.x1, top, s.z1), angle: s.angle ?? 0, centre: new V3((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2) });
  }
  return boxes;
}

/** A Þórseðla's body (no neck, no tail) as a box turned with her (world), from her place. */
function bodyBox(t) {
  const { place } = t;
  const k = place.size;
  const centre = new V3((MODEL.tail * 0.95 + MODEL.neck * 0.9) / 2, 0, 0).applyMatrix4(t.root.matrixWorld);
  const half = new V3((MODEL.neck * 0.9 - MODEL.tail * 0.95) / 2 * k, 0, MODEL.halfWidth * k);
  const y0 = t.root.position.y + 0.3 * k, y1 = t.root.position.y + MODEL.back * k;
  const angle = t.root.rotation.y; // three's turn about y (minus her heading), which takes the box's x along her
  return { name: `${place.id}'s body`, owner: place.id, min: new V3(centre.x - half.x, y0, centre.z - half.z), max: new V3(centre.x + half.x, y1, centre.z + half.z), angle, centre };
}

export function clearance(world) {
  const boxes = boardBoxes(world);
  const list = world.thorsedlas.list;
  const bodies = list.map(bodyBox);
  const report = {};
  for (const t of list) {
    const sk = t.skeleton();
    const parts = { neck: balls(sk.neck.slice(1)), tail: balls(sk.tail.slice(1)) };
    if (!t.place.neck) parts.neck = []; // Lyng's neck carries no route (her clip poses it)
    parts.head = [{ p: sk.head, r: 0.45 * t.k }];
    const others = [
      ...boxes.filter(b => b.owner !== t.place.id),
      ...bodies.filter(b => b.owner !== t.place.id),
      // her own shelf counts for her neck and tail too (not for her legs)
      ...boxes.filter(b => b.owner === t.place.id),
    ];
    const chains = list.filter(o => o !== t).flatMap(o => {
      const s = o.skeleton();
      return [{ name: `${o.place.id}'s neck`, balls: o.place.neck ? balls(s.neck.slice(1)) : [] }, { name: `${o.place.id}'s tail`, balls: balls(s.tail.slice(1)) }, { name: `${o.place.id}'s head`, balls: [{ p: s.head, r: 0.45 * o.k }] }];
    });
    for (const [part, list2] of Object.entries(parts)) {
      let best = { gap: Infinity, with: '', at: null };
      for (const ball of list2) {
        for (const box of others) {
          const g = gapToBox(ball.p, ball.r, box);
          if (g < best.gap) best = { gap: g, with: box.name, at: ball.p };
        }
        for (const chain of chains) for (const b of chain.balls) {
          const g = ball.p.distanceTo(b.p) - ball.r - b.r;
          if (g < best.gap) best = { gap: g, with: chain.name, at: ball.p };
        }
      }
      const at = best.at ? ` at ${best.at.toArray().map(v => v.toFixed(1)).join(',')}` : '';
      report[`${t.place.id} ${part}`] = list2.length ? `${best.gap.toFixed(2)} m (${best.with})${at}` : '-';
    }
  }
  return report;
}
