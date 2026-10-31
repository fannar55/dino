import * as THREE from 'three';
import { actorCollisionSnapshot, boxClearance } from './memory-clearance.js';
import { hasBoxClearance } from './world-nav-clearance.js';

const MAX_STEP = .04;
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function sampleTravel(route, progress) {
  const distance = THREE.MathUtils.clamp(progress, 0, 1) * route.total;
  let segment = 1;
  while (segment < route.lengths.length - 1 && distance > route.lengths[segment]) segment++;
  const a = route.points[segment - 1], b = route.points[segment], span = route.lengths[segment] - route.lengths[segment - 1];
  return { point: new THREE.Vector3().lerpVectors(a, b, span > 0 ? (distance - route.lengths[segment - 1]) / span : 1), yaw: b.heading ?? -Math.atan2(b.z - a.z, b.x - a.x) };
}

function predict(travel, horizon, step) {
  const snapshot = actorCollisionSnapshot(travel.actor);
  const parts = snapshot.parts.map(part => ({ ...part, center: part.center.map((v, i) => v - snapshot.position[i]), radius: Math.hypot(...part.half) }));
  const tree = partTree(parts), nodes = [];
  function number(node) { if (!node) return; node.index = nodes.length; nodes.push(node); node.children?.forEach(number); }
  number(tree);
  let yaw = snapshot.yaw;
  const poses = [];
  for (let future = 0; future <= horizon + step; future += step) {
    const age = Math.min(travel.duration, travel.age + future), progress = travel.progressAt ? travel.progressAt(age) : Math.min(1, age / Math.max(.01, travel.duration - .3));
    const sampled = sampleTravel(travel.route, progress);
    if (future > 0) yaw += angleTo(yaw, progress > .97 ? travel.finalYaw : sampled.yaw) * (1 - Math.exp(-step / .09));
    if (age >= travel.duration) yaw = travel.finalYaw;
    const angle = yaw - snapshot.yaw, c = Math.cos(angle), s = Math.sin(angle);
    poses.push({ point: sampled.point, yaw, stopped: age >= travel.duration, boxes: [], c, s });
  }
  return { poses, tree };
}

// A hierarchy only rejects disjoint groups. Every close leaf still uses the
// original measured OBBs and the same SAT margin; no skin geometry is removed.
function partTree(parts) {
  if (!parts.length) return null;
  if (parts.length === 1) return { ...parts[0], count: 1 };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) for (let axis = 0; axis < 3; axis++) {
    const reach = part.half.reduce((sum, half, i) => sum + half * Math.abs(part.axes[i][axis]), 0);
    min[axis] = Math.min(min[axis], part.center[axis] - reach); max[axis] = Math.max(max[axis], part.center[axis] + reach);
  }
  const half = max.map((value, axis) => (value - min[axis]) / 2), center = max.map((value, axis) => (value + min[axis]) / 2);
  const axis = half.indexOf(Math.max(...half)), sorted = [...parts].sort((a, b) => a.center[axis] - b.center[axis]), middle = sorted.length >> 1;
  return { center, half, radius: Math.hypot(...half), axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], count: parts.length, children: [partTree(sorted.slice(0, middle)), partTree(sorted.slice(middle))] };
}

function posedBox(part, pose) {
  return pose.boxes[part.index] ??= {
    half: part.half, radius: part.radius,
    center: [pose.c * part.center[0] + pose.s * part.center[2] + pose.point.x, part.center[1] + pose.point.y, -pose.s * part.center[0] + pose.c * part.center[2] + pose.point.z],
    axes: part.axes.map(axis => [pose.c * axis[0] + pose.s * axis[2], axis[1], -pose.s * axis[0] + pose.c * axis[2]]),
  };
}

function treesClear(a, ap, b, bp, margin, onConflict) {
  const x = posedBox(a, ap), y = posedBox(b, bp), reach = x.radius + y.radius + margin;
  if ((x.center[0] - y.center[0]) ** 2 + (x.center[1] - y.center[1]) ** 2 + (x.center[2] - y.center[2]) ** 2 >= reach * reach || hasBoxClearance(x, y, margin)) return true;
  if (!a.children && !b.children) { onConflict?.({ partA:a.name,partB:b.name,clearance:boxClearance(x,y),margin,positionA:ap.point.toArray(),positionB:bp.point.toArray(),yawA:ap.yaw,yawB:bp.yaw,stoppedA:ap.stopped,stoppedB:bp.stopped });return false; }
  return a.children && (!b.children || a.count >= b.count)
    ? a.children.every(child => treesClear(child, ap, b, bp, margin,onConflict))
    : b.children.every(child => treesClear(a, ap, child, bp, margin,onConflict));
}

/** Reserve time as well as space: a follower may use the same lane while the
 * leader is elsewhere on it. Predictions include the .3s final turn/settle and
 * stationary arrivals, so filling the far parking bay still leaves room to turn.
 * Sampling is finer than one footstep; the extra movement margin covers both
 * inter-sample travel and small walk-cycle changes in the measured skin boxes.
 */
export function canDepart(candidate, reservations, onConflict) {
  if (!reservations.length) return true;
  const horizon = Math.max(candidate.duration, ...reservations.map(travel => travel.duration - travel.age));
  const speed = travel => travel.age >= travel.duration ? 0 : travel.maxSpeed ?? travel.route.total / Math.max(.01, travel.duration - .3);
  // At most .06m relative translation from a sample to the middle of its
  // interval, leaving the rest of the .12m clearance for animated movement.
  // This also covers the faster paths used by reduced-motion mode.
  const step = Math.min(MAX_STEP, .12 / Math.max(.01, speed(candidate) + Math.max(...reservations.map(speed))));
  const a = predict(candidate, horizon, step);
  if (!a.tree) return true;
  for (const reservation of reservations) {
    const b = predict(reservation, horizon, step);
    if (!b.tree) continue;
    for (let i = 0; i < a.poses.length; i++) {
      const ap = a.poses[i], bp = b.poses[i];
      const margin = ap.stopped && bp.stopped ? .04 : .12;
      if (!treesClear(a.tree, ap, b.tree, bp, margin,detail=>onConflict?.({...detail,future:i*step,candidate:candidate.member,other:reservation.member}))) return false;
    }
  }
  return true;
}
