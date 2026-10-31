import * as THREE from 'three';
import { measureActor, actorCollisionSnapshot } from './memory-clearance.js';
import { hasBoxClearance } from './world-nav-clearance.js';
import { canDepart, sampleTravel } from './travel-traffic.js';

const pointDistance = (p, a, b) => { const x = b.x - a.x, z = b.z - a.z, t = THREE.MathUtils.clamp(((p.x - a.x) * x + (p.z - a.z) * z) / (x * x + z * z || 1), 0, 1); return Math.hypot(p.x - a.x - x * t, p.z - a.z - z * t); };
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function segmentDistance(a, b, c, d) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b));
}
function leafClear(shape, leaf) {
  // A broad leaf is tapered at both tips, rather than a square card obstacle.
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = THREE.MathUtils.lerp(shape.a.x, shape.b.x, t), z = THREE.MathUtils.lerp(shape.a.z, shape.b.z, t);
    const dz = Math.abs(z - leaf.z), rx = 1.29 * Math.sqrt(Math.max(0, 1 - (Math.min(1.3, dz) / 1.3) ** 2));
    if (dz < 1.3 + shape.radius && Math.hypot(Math.max(0, Math.abs(x - leaf.x) - rx), Math.max(0, dz - 1.3)) < shape.radius + .08) return false;
  }
  return true;
}
export function homeTravelProgress(route, age) {
  const duration = route.duration, ramp = Math.min(.18, duration * .18), t = THREE.MathUtils.clamp(age, 0, duration);
  const traveled = t < ramp ? t * t / (2 * ramp) : t > duration - ramp ? duration - ramp - (duration - t) ** 2 / (2 * ramp) : t - ramp / 2;
  return THREE.MathUtils.clamp(traveled / Math.max(.001, duration - ramp), 0, 1);
}
export function sampleHomeTravel(route, age) { return sampleTravel(route, homeTravelProgress(route, age)); }
class MinHeap {
  constructor(first) { this.items = [first]; }
  get length() { return this.items.length; }
  push(node) { const q = this.items; q.push(node); let i = q.length - 1; while (i > 0) { const parent = (i - 1) >> 1; if (q[parent].f <= node.f) break; q[i] = q[parent]; i = parent; } q[i] = node; }
  pop() { const q = this.items, result = q[0], last = q.pop(); if (q.length) { let i = 0; while (i * 2 + 1 < q.length) { let child = i * 2 + 1; if (child + 1 < q.length && q[child + 1].f < q[child].f) child++; if (q[child].f >= last.f) break; q[i] = q[child]; i = child; } q[i] = last; } return result; }
}

/** Small configuration-space planner for the leaf clearing. Other animals and
 * covers stay solid; a shared corridor is reserved only while it is occupied. */
export function createHomeNavigation({ heightAt, riverDistance, actors, leaves, objects = () => [], destinations = () => [], actorGeometry }) {
  // Geometry readers can also replay a captured pose without loading a renderer.
  const measure = actorGeometry?.measure ?? measureActor, snapshot = actorGeometry?.snapshot ?? actorCollisionSnapshot;
  function capsule(actor, point = actor.root.position, yaw = actor.root.rotation.y) {
    const size = measure(actor), scale = actor.root.scale.x, radius = size.halfWidth * scale + .045, front = Math.max(0, size.front * scale - radius), rear = Math.max(0, size.rear * scale - radius), dx = Math.cos(yaw), dz = -Math.sin(yaw);
    return { a: { x: point.x - dx * rear, z: point.z - dz * rear }, b: { x: point.x + dx * front, z: point.z + dz * front }, radius };
  }
  const step = .4, minX = -11, maxX = 7, minZ = -6.0, maxZ = 10.2;
  let planned = 0, deferred = 0, failures = 0, maxPlanningMs = 0, maxIterations = 0, maxSliceMs = 0, jobs = new Map(), lastPlan = null, lastTrafficBlock=null;
  const point = (x, z) => new THREE.Vector3(x, 0, z);
  function* search(actor, end, endYaw, { allowEndContact = false, allowStartContact = false } = {}) {
    let chunkStarted = performance.now(), cpuMs = 0;
    const start = actor.root.position.clone(), others = actors().filter(other => other !== actor && other.root.visible), obstacles = others.map(other => ({ ...capsule(other), actor: other })), covers = leaves(), solids = objects();
    // Reserve each friend's parking bay while building the path, even while
    // that friend is still walking. Otherwise a route cuts through the future
    // parked body and the departure gate must wait for a full replan.
    const plannedDestinations = new Map();
    for (const target of destinations()) if (target.actor !== actor && target.actor.root.visible) {
      obstacles.push({ ...capsule(target.actor, target.point, target.yaw), actor: target.actor, destination: true });
      plannedDestinations.set(target.actor, { position: target.point.clone(), yaw: target.yaw });
    }
    const plannedAround = new Map(others.map(other => [other, { position: other.root.position.clone(), yaw: other.root.rotation.y }]));
    const sourcePose = snapshot(actor), otherPoses = new Map(), partSpheres = new WeakMap();
    const sourceParts = sourcePose.parts.map(part => ({ ...part, center: part.center.map((v, i) => v - sourcePose.position[i]), radius: Math.hypot(...part.half) }));
    // The Triceratops frill is much wider than its planted feet. Use measured
    // foot-bone centres plus sole/stride clearance for shoreline tests, rather
    // than treating the full frill width as a foot in the river.
    const localFeet = [], inverseRoot = actor.root.matrixWorld.clone().invert();
    actor.model.traverse(bone => { if (bone.isBone && /Foot/.test(bone.name)) localFeet.push(bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot).multiply(actor.root.scale)); });
    const validCache = new Map(), poseCache = new Map(); let reason = '';
    const checkPose = (p, yaw) => {
      reason = '';
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) return false;
      const shape = capsule(actor, p, yaw);
      const nearContact = allowEndContact && Math.hypot(p.x - end.x, p.z - end.z) < 2.3 || allowStartContact && Math.hypot(p.x - start.x, p.z - start.z) < 2.3;
      let ground;
      const preciseClear = (parts, margin = .025) => {
        let obstacles = partSpheres.get(parts);
        if (!obstacles) { obstacles = parts.map(part => ({ part, radius: Math.hypot(...part.half) })); partSpheres.set(parts, obstacles); }
        ground ??= heightAt(p.x, p.z) + .075;
        const angle = yaw - sourcePose.yaw, c = Math.cos(angle), s = Math.sin(angle);
        for (const source of sourceParts) {
          const x = c * source.center[0] + s * source.center[2] + p.x, y = source.center[1] + ground, z = -s * source.center[0] + c * source.center[2] + p.z;
          let posed;
          for (const { part: b, radius } of obstacles) {
            const reach = source.radius + radius + margin;
            if ((x-b.center[0])**2 + (y-b.center[1])**2 + (z-b.center[2])**2 >= reach * reach) continue;
            posed ??= { center: [x,y,z], half: source.half, axes: source.axes.map(a => [c*a[0]+s*a[2],a[1],-s*a[0]+c*a[2]]) };
            if (!hasBoxClearance(posed, b, margin)) return false;
          }
        }
        return true;
      };
      for (const other of obstacles) if (segmentDistance(shape.a, shape.b, other.a, other.b) < shape.radius + other.radius + (other.destination ? .14 : .035)) {
        if (!nearContact) { reason = `actor:${other.actor.species}`; return false; }
        if (!otherPoses.has(other.actor)) otherPoses.set(other.actor, snapshot(other.actor));
        if (!preciseClear(otherPoses.get(other.actor).parts, .07)) { reason = `actor-precise:${other.actor.species}`; return false; }
      }
      for (const object of solids) {
        if (segmentDistance(shape.a, shape.b, object.a, object.b) >= shape.radius + object.radius + .035) continue;
        if (object.id === 'branch' || object.id === 'main-log' && nearContact) {
          if (object.parts?.length && preciseClear(object.parts, object.id === 'branch' ? .045 : -.015)) continue;
        }
        reason = object.id; return false;
      }
      for (const leaf of covers) if (!leafClear(shape, leaf)) return false;
      if (p.x > 2.5 || p.z < 0 && p.x > -2.5) {
        const dx = Math.cos(yaw), dz = -Math.sin(yaw);
        for (const foot of localFeet) if (riverDistance(p.x + dx * foot.x - dz * foot.z, p.z + dz * foot.x + dx * foot.z).distance < 1.96) { reason = 'river-foot'; return false; }
      }
      return true;
    };
    const valid = (p, yaw) => {
      const key = `${p.x.toFixed(4)}:${p.z.toFixed(4)}:${Math.atan2(Math.sin(yaw), Math.cos(yaw)).toFixed(5)}`;
      const cached = poseCache.get(key);
      if (cached) { reason = cached.reason; return cached.value; }
      const value = checkPose(p, yaw); poseCache.set(key, { value, reason }); return value;
    };
    const turnClear = (p, from, to) => { const d = Math.atan2(Math.sin(to - from), Math.cos(to - from)); for (let i = 1; i <= 3; i++) if (!valid(p, from + d * i / 3)) return false; return true; };
    const startValid = valid(start, actor.root.rotation.y), startReason = reason, endValid = valid(end, endYaw), endReason = reason;
    lastPlan = { species: actor.species, start: start.toArray(), end: end.toArray(), startValid, startReason, endValid, endReason };
    if (!endValid) { failures++; maxPlanningMs = Math.max(maxPlanningMs, performance.now() - chunkStarted); return null; }
    const lineClear = (a, b, yaw) => { const count = Math.ceil(a.distanceTo(b) / .22); for (let i = 1; i <= count; i++) if (!valid(new THREE.Vector3().lerpVectors(a, b, i / count), yaw)) return false; return true; };
    const startX = Math.round((start.x - minX) / step), startZ = Math.round((start.z - minZ) / step), startH = (Math.round(-actor.root.rotation.y / (Math.PI / 4)) + 8) % 8;
    const key = (x, z, h) => `${x}:${z}:${h}`, first = { x: startX, z: startZ, h: startH, p: start, g: 0, f: start.distanceTo(end), parent: null }, open = new MinHeap(first), best = new Map([[key(startX, startZ, startH), first]]);
    let goal = null, goalHeading, iterations = 0;
    while (open.length && iterations++ < 18000) {
      if (performance.now() - chunkStarted > 1.25) { cpuMs += performance.now() - chunkStarted; yield; chunkStarted = performance.now(); }
      const current = open.pop(); if (best.get(key(current.x, current.z, current.h)) !== current) continue;
      const currentYaw = current.parent ? -current.h * Math.PI / 4 : actor.root.rotation.y;
      if (current.p.distanceTo(end) < .7) {
        const yaw = -Math.atan2(end.z - current.p.z, end.x - current.p.x);
        for (const facing of [yaw, yaw + Math.PI]) {
          if (performance.now() - chunkStarted > 1.25) { cpuMs += performance.now() - chunkStarted; yield; chunkStarted = performance.now(); }
          if (turnClear(current.p, currentYaw, facing) && lineClear(current.p, end, facing) && turnClear(end, facing, endYaw)) { goal = current; goalHeading = facing; break; }
        }
        if (goal) break;
      }
      // A baby can turn in its cleared hiding place before entering an aisle.
      // These turns are tested through intermediate orientations as well.
      for (const direction of [-1, 1]) {
        if (performance.now() - chunkStarted > 1.25) { cpuMs += performance.now() - chunkStarted; yield; chunkStarted = performance.now(); }
        const h = (current.h + direction + 8) % 8, yaw = -h * Math.PI / 4, id = key(current.x, current.z, h), g = current.g + .28;
        if (best.has(id) && best.get(id).g <= g || !turnClear(current.p, currentYaw, yaw)) continue;
        const node = { x: current.x, z: current.z, h, p: current.p, g, f: g + current.p.distanceTo(end) * 1.2, parent: current }; best.set(id, node); open.push(node);
      }
      for (let direction = -1; direction <= 1; direction++) {
        if (performance.now() - chunkStarted > 1.25) { cpuMs += performance.now() - chunkStarted; yield; chunkStarted = performance.now(); }
        const h = (current.h + direction + 8) % 8, yaw = -h * Math.PI / 4, x = current.x + Math.round(Math.cos(yaw)), z = current.z + Math.round(-Math.sin(yaw)), id = key(x, z, h), next = point(minX + x * step, minZ + z * step);
        let clear = validCache.get(id); if (clear === undefined) { clear = valid(next, yaw); validCache.set(id, clear); }
        if (!clear || !turnClear(current.p, currentYaw, yaw)) continue;
        if (performance.now() - chunkStarted > 1.25) { cpuMs += performance.now() - chunkStarted; yield; chunkStarted = performance.now(); }
        if (!lineClear(current.p, next, yaw)) continue;
        const g = current.g + current.p.distanceTo(next) + Math.abs(direction) * .10;
        if (best.has(id) && best.get(id).g <= g) continue;
        const node = { x, z, h, p: next, g, f: g + next.distanceTo(end) * 1.2, parent: current }; best.set(id, node); open.push(node);
      }
      // A beak that has just pushed a log backs away before turning. Keeping
      // the measured heading avoids sweeping the tail or frill into the bark.
      if (allowStartContact && current.p.distanceTo(start) < 2.6 || current.p.distanceTo(end) < 2.5) {
        const h = current.h, yaw = currentYaw, x = current.x - Math.round(Math.cos(yaw)), z = current.z - Math.round(-Math.sin(yaw)), id = key(x, z, h), next = point(minX + x * step, minZ + z * step), g = current.g + current.p.distanceTo(next) * 1.12;
        if ((!best.has(id) || best.get(id).g > g) && lineClear(current.p, next, yaw)) { const node = { x, z, h, p: next, heading: yaw, g, f: g + next.distanceTo(end) * 1.2, parent: current }; best.set(id, node); open.push(node); }
      }
    }
    maxPlanningMs = Math.max(maxPlanningMs, cpuMs + performance.now() - chunkStarted); maxIterations = Math.max(maxIterations, iterations);
    if (!goal) { failures++; return null; }
    const last = end.clone(); last.heading = goalHeading;
    const raw = [last]; for (let node = goal; node; node = node.parent) if (!raw.at(-1).equals(node.p)) { const p = node.p.clone(); if (node.heading !== undefined) p.heading = node.heading; raw.push(p); } raw.reverse();
    // Remove collinear grid steps; retain the curved sequence through corners.
    const points = [raw[0]];
    for (let i = 1; i < raw.length - 1; i++) { const a = points.at(-1), b = raw[i], c = raw[i + 1]; if (Math.abs(cross(a, b, c)) > .001 || b.heading !== undefined || c.heading !== b.heading) points.push(b); }
    points.push(last); for (const p of points.slice(1, -1)) p.y = heightAt(p.x, p.z) + .075;
    const lengths = [0]; for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + points[i].distanceTo(points[i - 1]));
    planned++; return { points, lengths, total: lengths.at(-1), duration: Math.max(.65, lengths.at(-1) / 2.9 + .18), endYaw, age: 0, plannedAround, plannedDestinations };
  }
  function canStart(actor, route, moving) {
    // The spatial search already proves clearance from stationary friends.
    // If one has newly arrived since that search, rebuild against its real pose.
    for (const other of actors().filter(other => other !== actor && other.root.visible && !moving.some(cell => cell.actor === other))) {
      const matches = original => original && original.position.distanceToSquared(other.root.position) <= .0025 && Math.abs(Math.atan2(Math.sin(original.yaw - other.root.rotation.y), Math.cos(original.yaw - other.root.rotation.y))) <= .08;
      if (!matches(route.plannedAround?.get(other)) && !matches(route.plannedDestinations?.get(other))) {
        jobs.delete(actor); deferred++; return false;
      }
    }
    // Timed articulated envelopes permit two matched friends to share an aisle
    // while one is farther ahead. A blanket 2D capsule reserved the whole trip.
    const reservation = (value, transfer) => ({ actor: value, route: transfer, age: transfer.age, duration: transfer.duration + .24, finalYaw: transfer.endYaw, maxSpeed: 2.9, progressAt: age => homeTravelProgress(transfer, age) });
    const clear = canDepart(reservation(actor, route), moving.map(cell => reservation(cell.actor, cell.transfer)),detail=>{lastTrafficBlock={...detail,species:actor.species,age:route.age,movingAges:moving.map(cell=>cell.transfer.age)}});
    if (!clear) deferred++;
    return clear;
  }
  function plan(actor, end, yaw, options) { const iterator = search(actor, end, yaw, options); let result; do { result = iterator.next(); } while (!result.done); return result.value; }
  function request(actor, end, yaw, options) {
    const key = `${end.x.toFixed(4)}:${end.z.toFixed(4)}:${yaw.toFixed(4)}:${JSON.stringify(options ?? {})}`;
    let job = jobs.get(actor);
    if (!job || job.key !== key) { job = { key, iterator: search(actor, end, yaw, options), done: false, result: undefined, cpuMs: 0 }; jobs.set(actor, job); }
    if (!job.done) return undefined;
    if (job.result === null) jobs.delete(actor);
    return job.result;
  }
  function pump(budgetMs = 3) {
    const started = performance.now();
    for (const job of jobs.values()) {
      if (job.done) continue;
      do { const at = performance.now(), result = job.iterator.next(), took = performance.now() - at; job.cpuMs += took; maxSliceMs = Math.max(maxSliceMs, took); if (result.done) { job.done = true; job.result = result.value; break; } } while (performance.now() - started < budgetMs);
      if (performance.now() - started >= budgetMs) break;
    }
  }
  // The planner CPU (ms) this actor's current search has been given: a walk times out on this, not on game seconds (bridge-adventure.js).
  return { plan, request, pump, canStart, spent: actor => jobs.get(actor)?.cpuMs ?? 0, release: (actor, departed = false) => {
    jobs.delete(actor);
    // An unfinished search may still see the departing friend in its old
    // hiding place. Rebuild once that aisle is vacated, instead of completing
    // a long detour around an obstacle which no longer exists.
    if (departed) for (const [other, job] of jobs) if (!job.done) jobs.delete(other);
  }, getDebug: () => ({ planned, deferred, failures, maxPlanningMs, maxIterations, maxSliceMs, lastPlan,lastTrafficBlock, pendingPlans: [...jobs.values()].filter(job => !job.done).length }), reset() { jobs = new Map(); lastPlan = lastTrafficBlock = null; planned = deferred = failures = maxPlanningMs = maxIterations = maxSliceMs = 0; } };
}
