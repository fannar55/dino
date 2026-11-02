// A child's hands for the review flight (?chapter=flug&play=track1): everything Egill may do (spec 6) done once or more, at fixed
// times on the flight's clock, through the page's own input, so a recording (tools/chapter-video.mjs --query "play=track1") shows it as
// a child would see it: real pointer events on the canvas (engine/input/pointer.js makes the drags and taps of them) and clicks on the
// „Hraðar!“ button. Only the review chapter reads it (chapters/flug.js), and only in a page (a test's world has no PointerEvent).
//
//   s.after(0, () => track1(s, c));   // c: the flight's state (chapters/flug.js), before theFlight
import * as THREE from 'three';
import { BEATS } from './kafli4-route.js';

/** The track: steers and skims in B and C, „Hraðar!“ whenever its time comes, each group tapped as it comes into view, the land in F. */
export function* track1(s, c) {
  const canvas = c.doc?.getElementById?.('view') ?? null;
  if (!canvas || typeof PointerEvent === 'undefined') return;
  yield s.until(() => c.flight !== null && c.play);
  const now = () => s.time - c.flight.started;
  const at = function* (time) {
    const left = time - now();
    if (left > 1e-9) yield s.wait(left);
  };
  const size = () => canvas.getBoundingClientRect();
  let id = 40;
  const fire = (type, [x, y], pointerId) => {
    const rect = size();
    canvas.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      clientX: rect.left + x, clientY: rect.top + y,
    }));
  };
  // a finger put down at `from` (fractions of the canvas), drawn to `to` over `move` seconds, held there `hold` seconds and lifted
  function* drag(from, to, move, hold) {
    const pointerId = ++id;
    const px = ([fx, fy]) => [fx * size().width, fy * size().height];
    const a = px(from);
    const b = px(to);
    fire('pointerdown', a, pointerId);
    const start = s.time;
    for (let k = 0; k < 1;) {
      yield;
      k = Math.min(1, (s.time - start) / move);
      fire('pointermove', [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], pointerId);
    }
    yield s.wait(hold);
    fire('pointerup', b, pointerId);
  }
  const tap = ([x, y]) => {
    const pointerId = ++id;
    fire('pointerdown', [x, y], pointerId);
    fire('pointerup', [x, y], pointerId);
  };
  const press = () => {
    const button = c.play.button;
    if (button && !button.hidden) button.click();
  };

  // Each group tapped as soon as it is in view in a chase shot, 40 to 90 m ahead of her (the tap lands on it: its target is twice its
  // size), from the start of C until each has been called.
  function* groups() {
    const point = new THREE.Vector3();
    const { route, flier, world } = c;
    while (now() < BEATS.D) {
      yield;
      if (c.camera.current !== 'chase' || now() < BEATS.C) continue;
      for (const g of route.groups) {
        if (c.play.calls.some(call => call.id === g.id)) continue;
        const ahead = (g.u - flier.u) * route.length;
        if (ahead < 40 || ahead > 90) continue;
        const animal = world.forest?.animals?.groups.find(a => a.id === g.id);
        point.copy(animal?.point ?? point.fromArray(g.at)).project(world.camera);
        if (point.z > 1 || Math.abs(point.x) > 0.85 || Math.abs(point.y) > 0.85) continue;
        tap([(point.x + 1) / 2 * size().width, (1 - point.y) / 2 * size().height]);
      }
    }
  }

  // The rest, in order on the flight's clock (the shots: kafli4-flight.js; chase shots in B 15 to 25 and from 28.3, in C to 44.5,
  // 54.5 to 57.5 and 68 to 75, in D 80 to 83 and 89 to 90.5, and from 99.5)
  function* hands() {
    yield* at(17); // B: a steer to the right, held, and let go
    yield* drag([0.5, 0.62], [0.74, 0.62], 0.8, 1.4);
    yield* at(21); // down to the water, a little to the left: the splash and Egill's laugh
    yield* drag([0.5, 0.55], [0.42, 0.72], 0.6, 1.8);
    yield* at(29.5); // to the left
    yield* drag([0.55, 0.6], [0.3, 0.6], 0.8, 1.6);
    yield* at(38); // C: „Hraðar!“
    press();
    yield* at(43.6);
    press();
    yield* at(55);
    press();
    yield* at(69); // a steer and a skim along the bank, then „Hraðar!“
    yield* drag([0.5, 0.55], [0.66, 0.7], 0.6, 1.6);
    yield* at(72);
    press();
    yield* at(81); // D: between the walls
    press();
    yield* drag([0.5, 0.6], [0.36, 0.6], 0.6, 1.2);
    yield* at(89.2);
    press();
    yield* at(100); // after 92 s a steer does nothing
    yield* drag([0.5, 0.6], [0.75, 0.6], 0.6, 1);
    yield* at(127); // F: a tap on the land, in the sky over it: the big call now
    tap([size().width * 0.5, size().height * 0.28]);
  }

  yield s.all(groups(), hands());
}
