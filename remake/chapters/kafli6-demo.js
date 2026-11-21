// A child's hands for the owner's videos of chapter 6 (kafli6.js), never part of the game: the chapter starts it only when the page
// asks with ?kafli6=pikk (tools/chapter-video.mjs --query "kafli6=pikk"). It taps as a child would, with pointer events on the
// game's canvas at where each thing is on the screen, so the game's own tap circles decide (engine/input/pointer.js), and a ring
// shows where each finger lands, for whoever watches.
//
// What it taps (steps, prints and rounds counted from 1):
//   the stones: a wobbling one first at steps 1 and 3, the right one after it glitters at step 2, after Mosi names it at step 4
//   the prints: the cloud before print 2, print 4 while Mosi says "Þrjú!", print 5 after it glimmers, the rest soon
//   the call: Mosi in rounds 1 and 3 (in round 2 he calls by himself), a way before she answers in round 1, the wrong way first in
//   round 2; then her head, and the star as it rises

/** Per step of the stones: when (s after it is wanted) the child taps a wobbling stone, and when the right one. */
const STONES = [{ wrong: 1.5, right: 3.6 }, { right: 6.6 }, { wrong: 1.2, right: 3.2 }, { right: 13 }, { right: 1.6 }];
/** Per print: when (s after it is wanted) the child taps it, and the cloud (an empty spot) before. */
const PRINTS = [{ right: 1.8 }, { cloud: 1.2, right: 3 }, { right: 1.6 }, { right: 0.4 }, { right: 8.8 }, { right: 1.8 }];
/** Per round of the call: tap Mosi after `mosi` s (null: let him call by himself), a way before she answers, a wrong way first. */
const ROUNDS = [{ mosi: 2, early: 0.4, right: 2.2 }, { mosi: null, wrong: 1.4, right: 3.4 }, { mosi: 1.6, right: 2 }];
const HEAD_AFTER = 2.2;
const STAR_AFTER = 1.5;
const EMPTY = { x: 0.86, y: 0.2 }; // the cloud: high on the right of the screen, where no print is

/** Asked for by the page? */
export function demoAsked() {
  return new URLSearchParams(globalThis.location?.search ?? '').get('kafli6') === 'pikk';
}

/** The child's hands, on the scene's clock: a task that runs until the chapter ends (`c.ended`). */
export function startDemoChild(s, c, { canvas = globalThis.document?.getElementById('view') } = {}) {
  if (!canvas) return;
  const THREE = c.world.THREE;
  const done = new Set();
  let wanted = null; // { key, since }
  let starSeen = null;

  function screen(spec) {
    const p = c.world.resolvePoint(spec, new THREE.Vector3()).project(c.world.camera);
    const box = canvas.getBoundingClientRect();
    return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height, inFront: p.z < 1 };
  }
  function tapScreen(x, y) {
    const init = { pointerId: 11, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    ring(x, y);
  }
  function tapAt(spec) {
    if (!spec) return;
    const { x, y, inFront } = screen(spec);
    if (inFront) tapScreen(x, y);
  }
  function tapEmpty() {
    const box = canvas.getBoundingClientRect();
    tapScreen(box.left + EMPTY.x * box.width, box.top + EMPTY.y * box.height);
  }
  function ring(x, y) {
    const el = document.createElement('div');
    el.style.cssText = `position: fixed; left: ${x - 26}px; top: ${y - 26}px; width: 52px; height: 52px; border-radius: 50%;
      border: 4px solid rgba(255, 255, 255, 0.95); box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35); pointer-events: none; z-index: 50;
      transition: transform 0.6s ease-out, opacity 0.6s ease-out; transform: scale(0.6); opacity: 1;`;
    document.body.append(el);
    requestAnimationFrame(() => { el.style.transform = 'scale(1.3)'; el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 900);
  }
  const once = (what, fn) => {
    if (done.has(what)) return;
    done.add(what);
    fn();
  };
  const point = name => c.aims?.[name] ?? null;
  const since = (key, now) => {
    if (wanted?.key !== key) wanted = { key, since: now };
    return now - wanted.since;
  };

  s.after(0, function* hands() {
    while (!c.ended) {
      const now = s.time;
      // the stones
      const stones = c.stoneTask?.state();
      if (stones && !stones.done && stones.waiting) {
        const plan = STONES[stones.step] ?? { right: 1.5 };
        const t = since(`stone ${stones.step}`, now);
        const step = c.steps[stones.step].stones;
        const right = step.find(x => x.right);
        const wrong = step.find(x => !x.right);
        if (plan.wrong !== undefined && wrong && t >= plan.wrong) once(`stone ${stones.step} wrong`, () => tapAt(point(wrong.id)));
        if (t >= plan.right) once(`stone ${stones.step} right`, () => tapAt(point(right.id)));
      }
      // the prints
      const prints = c.printTask?.state();
      if (prints && !prints.done && prints.waiting) {
        const plan = PRINTS[prints.next] ?? { right: 1.5 };
        const t = since(`print ${prints.next}`, now);
        if (plan.cloud !== undefined && t >= plan.cloud) once(`print ${prints.next} cloud`, tapEmpty);
        if (t >= plan.right) once(`print ${prints.next}`, () => tapAt(point(`print${prints.next + 1}`)));
      }
      // the call
      const call = c.callTask?.state();
      if (call && call.phase !== 'done') {
        const plan = ROUNDS[call.round] ?? { mosi: 1.5, right: 2 };
        const t = since(`call ${call.round} ${call.phase}`, now);
        if (call.phase === 'ask' && plan.mosi !== null && t >= plan.mosi) once(`call ${call.round} mosi`, () => tapAt(point('mosi')));
        if (call.phase === 'calling' && plan.early !== undefined && t >= plan.early) {
          once(`call ${call.round} early`, tapEmpty); // a way before she answers: nothing happens, and nothing says no
        }
        if (call.phase === 'listen') {
          const wrong = ['left', 'ahead', 'right'].find(d => d !== call.direction);
          if (plan.wrong !== undefined && t >= plan.wrong) once(`call ${call.round} wrong`, () => tapAt(point(`dir-${wrong}`)));
          if (t >= plan.right) once(`call ${call.round} right`, () => tapAt(point(`dir-${call.direction}`)));
        }
      }
      // her head, when she lays it down
      if (point('gramedla-head')) {
        c.demoHeadSince ??= now;
        if (now - c.demoHeadSince >= HEAD_AFTER) once('head', () => tapAt(point('gramedla-head')));
      }
      // the star, as it rises
      const star = c.world.scene.children.find(o => o.isSprite && o.renderOrder === 20);
      if (star) {
        starSeen ??= now;
        if (now - starSeen >= STAR_AFTER) once('star', () => tapAt(star.position.toArray()));
      }
      yield;
    }
  });
}
