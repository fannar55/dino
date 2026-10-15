import * as THREE from 'three';

// Pointer input for the stage: taps on named targets in the world, and drags.
//
// A target is a sphere around a point spec (engine/points.js), so it can follow an actor, a butterfly
// or anything else that moves: its centre is resolved when a finger lands, never when the target is
// added. The press is what is picked (it is what the child aimed at; the camera and the targets may
// have moved by the time the finger lifts) and the release confirms the tap. Only the first finger
// is followed; a second one is ignored until the first lifts. Positions are canvas pixels.
//
//   'tap'   { name, x, y }  a press and release within 300 ms and 12 px. `name` is the target the
//                           finger landed on, or null when there was none; x and y are where it landed.
//   'drag'  { dx, dy, phase, x, y }  a press that moved 12 px or more. phase is 'start', 'move' or
//                           'end'; dx and dy are the movement since the previous drag event (since
//                           the press, for 'start'), so a drag's events add up to the finger's travel.
//                           A cancelled touch ends its drag too.

const TAP_MS = 300; // a tap is a press and release within this long...
const SLOP_PX = 12; // ...and this close; a press that moves this far is a drag
const MIN_TARGET_PX = 44; // a target is at least this wide on screen, whatever its size or distance

const toCentre = new THREE.Vector3();

/**
 * Which target does a ray hit first? `ray` is a THREE.Ray (unit direction); `targets` is any iterable
 * of { name, centre: Vector3, radius, enabled } (spheres, in metres). The answer is the name of the
 * enabled sphere the ray enters first, or null. Pure: the caller has already resolved each centre.
 *
 * `minAngle` (radians, 0 = off) is the smallest angular radius a target may have as seen from the ray
 * origin: a sphere that looks smaller is widened to distance * tan(minAngle), never shrunk. It is
 * what lets a finger hit something small or far away.
 */
export function pickTarget(ray, targets, { minAngle = 0 } = {}) {
  const slope = Math.tan(minAngle);
  let best = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    if (!target.enabled) continue;
    toCentre.subVectors(target.centre, ray.origin);
    const range = toCentre.length();
    const radius = Math.max(target.radius, range * slope);
    const along = toCentre.dot(ray.direction); // where the ray passes closest to the centre
    const miss = range * range - along * along; // squared distance between them
    if (miss > radius * radius) continue;
    const half = Math.sqrt(radius * radius - miss);
    if (along + half < 0) continue; // the whole sphere is behind the origin
    const distance = Math.max(0, along - half); // where the ray enters it (0 when it starts inside)
    if (distance < bestDistance) {
      best = target.name;
      bestDistance = distance;
    }
  }
  return best;
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
  let finger = null; // the pointer being followed: { id, startX, startY, startTime, lastX, lastY, dragging, hit }

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
      startX: x, startY: y, startTime: event.timeStamp,
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
    } else if (event.timeStamp - gesture.startTime <= TAP_MS) {
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
