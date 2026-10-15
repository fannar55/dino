import * as THREE from 'three';

// Pointer input for the stage: taps on named targets in the world, and drags.
//
// A target is a sphere around a point spec (engine/points.js), so it can follow an actor, a butterfly
// or anything else that moves: its centre is resolved when a finger lands, never when the target is
// added. The press is what is picked (it is what the child aimed at; the camera and the targets may
// have moved by the time the finger lifts) and the release confirms the tap. Only the first finger
// is followed; a second one is ignored until the first lifts. Positions are canvas pixels.
//
//   'tap'   { name, x, y }  a press that is released before it moves 12 px, however long it was held.
//                           `name` is the target the finger landed on, or null when there was none;
//                           x and y are where it landed.
//   'drag'  { dx, dy, phase, x, y }  a press that moved 12 px or more. phase is 'start', 'move' or
//                           'end'; dx and dy are the movement since the previous drag event (since
//                           the press, for 'start'), so a drag's events add up to the finger's travel.
//                           A cancelled touch ends its drag too.

const SLOP_PX = 12; // a press that moves this far is a drag; until then it is still a tap
const MIN_TARGET_PX = 44; // a target is at least this wide on screen, whatever its size or distance

const toCentre = new THREE.Vector3();

/**
 * Where a ray enters a sphere: -1 if it does not meet it, 0 if it starts inside. `along` is how far
 * down the ray it passes closest to the centre, `miss` the squared distance between them then.
 */
function entry(radius, along, miss) {
  if (miss > radius * radius) return -1;
  const half = Math.sqrt(radius * radius - miss);
  if (along + half < 0) return -1; // the whole sphere is behind the origin
  return Math.max(0, along - half);
}

/**
 * Which target does a ray pick? `ray` is a THREE.Ray (unit direction); `targets` is any iterable of
 * { name, centre: Vector3, radius, enabled } (spheres, in metres). The answer is a name, or null.
 * Pure: the caller has already resolved each centre. Disabled targets are ignored. In two steps:
 *   1. a target whose own sphere the ray hits wins, the one it enters first if there are several;
 *   2. only when there is none, `minAngle` counts: a target the ray passes within distance *
 *      tan(minAngle) of is reached, and of those the one whose centre is closest in angle to the ray
 *      wins, not the one nearest along it.
 * `minAngle` (radians, 0 = off) is the smallest angular radius a target may have as seen from the ray
 * origin. It lets a finger pick something small or far away, and yields to a target hit squarely.
 */
export function pickTarget(ray, targets, { minAngle = 0 } = {}) {
  const slope = Math.tan(minAngle);
  let hit = null; // the target whose own sphere the ray enters first
  let hitDistance = Infinity;
  let reached = null; // else the one it reaches through the widening, closest in angle
  let reachedAngle = Infinity;
  for (const target of targets) {
    if (!target.enabled) continue;
    toCentre.subVectors(target.centre, ray.origin);
    const range = toCentre.length();
    const along = toCentre.dot(ray.direction); // where the ray passes closest to the centre
    const miss = range * range - along * along; // squared distance between them
    const distance = entry(target.radius, along, miss);
    if (distance >= 0) {
      if (distance < hitDistance) {
        hit = target.name;
        hitDistance = distance;
      }
    } else if (entry(range * slope, along, miss) >= 0) {
      const angle = Math.atan2(Math.sqrt(miss), along);
      if (angle < reachedAngle) {
        reached = target.name;
        reachedAngle = angle;
      }
    }
  }
  return hit ?? reached;
}

/**
 * Listen to a canvas. Returns
 *   addTarget(name, { point, radius })  a tap target: any point spec, radius in metres. Adding a name
 *                                       again replaces the target (and switches it on)
 *   removeTarget(name)
 *   setEnabled(name, on)                a target that is off is not hit, and does not hide others
 *   on(event, fn)                       'tap' or 'drag' (above); returns the function that stops listening
 */
export function createPointer({ canvas, camera, world }) {
  const targets = new Map(); // name -> { name, point, radius, enabled, centre }
  const listeners = new Map([['tap', []], ['drag', []]]);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let finger = null; // the pointer being followed: { id, startX, startY, lastX, lastY, dragging, hit }

  // A listener that throws must not stop the others, or leave a finger half handled.
  function emit(event, payload) {
    for (const fn of [...listeners.get(event)]) {
      try {
        fn(payload);
      } catch (error) {
        console.error('[pointer]', error);
      }
    }
  }

  /** Where an event is on the canvas, in pixels from its top-left corner. */
  function local(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** The target under canvas position (x, y), or null. */
  function pick(x, y) {
    const { width, height } = canvas.getBoundingClientRect();
    ndc.set((x / width) * 2 - 1, 1 - (y / height) * 2);
    raycaster.setFromCamera(ndc, camera);
    for (const target of targets.values()) if (target.enabled) world.resolvePoint(target.point, target.centre);
    // A 44 px target spans 22 px each way from its centre: the angle that is, from the camera.
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
    const minAngle = Math.atan((MIN_TARGET_PX * tanHalfFov) / height);
    return pickTarget(raycaster.ray, targets.values(), { minAngle });
  }

  function emitDrag(gesture, phase, x, y) {
    const dx = x - gesture.lastX;
    const dy = y - gesture.lastY;
    gesture.lastX = x;
    gesture.lastY = y;
    emit('drag', { dx, dy, phase, x, y });
  }

  /** The finger is at (x, y): once it is 12 px from where it landed, the press is a drag. */
  function follow(x, y) {
    if (!finger.dragging) {
      if (Math.hypot(x - finger.startX, y - finger.startY) < SLOP_PX) return;
      finger.dragging = true;
      emitDrag(finger, 'start', x, y);
    } else if (x !== finger.lastX || y !== finger.lastY) {
      emitDrag(finger, 'move', x, y);
    }
  }

  function onDown(event) {
    if (finger || event.button > 0) return; // a second finger waits for the first; only the main button counts
    const { x, y } = local(event);
    finger = {
      id: event.pointerId,
      startX: x, startY: y,
      lastX: x, lastY: y, // where the last drag event left the finger
      dragging: false,
      hit: pick(x, y), // what it landed on
    };
    try {
      canvas.setPointerCapture?.(event.pointerId); // so a mouse that leaves the canvas still lifts here
    } catch {
      // the pointer is already gone
    }
  }

  function onMove(event) {
    if (!finger || event.pointerId !== finger.id) return;
    const { x, y } = local(event);
    follow(x, y);
  }

  function onUp(event) {
    if (!finger || event.pointerId !== finger.id) return;
    const { x, y } = local(event);
    follow(x, y); // a release 12 px from the press is a drag too
    const gesture = finger;
    finger = null;
    if (gesture.dragging) {
      emitDrag(gesture, 'end', x, y);
    } else {
      // The target pressed, unless it was taken away or switched off since.
      const name = targets.get(gesture.hit)?.enabled ? gesture.hit : null;
      emit('tap', { name, x: gesture.startX, y: gesture.startY });
    }
  }

  function onCancel(event) {
    if (!finger || event.pointerId !== finger.id) return;
    const gesture = finger;
    finger = null;
    if (gesture.dragging) emitDrag(gesture, 'end', gesture.lastX, gesture.lastY);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  // A long press can open the browser's context menu, which on Android takes the touch over and ends
  // it with a cancel: a slow tap would be lost.
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  return {
    addTarget(name, { point, radius } = {}) {
      if (point == null) throw new TypeError(`Tap target "${name}" needs a point`);
      if (!Number.isFinite(radius) || radius <= 0) throw new TypeError(`Tap target "${name}" needs a radius in metres, not ${radius}`);
      targets.set(name, { name, point, radius, enabled: true, centre: new THREE.Vector3() });
    },
    removeTarget(name) {
      targets.delete(name);
    },
    setEnabled(name, on) {
      const target = targets.get(name);
      if (!target) throw new Error(`No tap target named "${name}"`);
      target.enabled = Boolean(on);
    },
    on(event, fn) {
      const list = listeners.get(event);
      if (!list) throw new Error(`Unknown pointer event "${event}" (use "tap" or "drag")`);
      list.push(fn);
      return () => {
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
  };
}
