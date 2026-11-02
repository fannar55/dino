// The up stroke: a finger drawn up the screen, anywhere on it, at least a fifth of its height, is one stroke; a tap counts as a
// stroke's smaller sister. Made for chapter 4's wind task (spec 4.3: the child strokes up for each gust, and a child who taps gets
// there too), and for any other chapter that wants it. It listens to the pointer (engine/input/pointer.js), whose drags already
// follow one finger at a time and whose taps are presses that moved less than 12 px.
//
//   const swipe = createSwipe(pointer, { height });   // height: the canvas's in px, a number or a function (it changes when turned)
//   const off = swipe.on(({ kind, x, y, x0, y0 }) => ...);
//       kind 'up'   a stroke: (x0, y0) where the finger landed, (x, y) where it was when the stroke counted
//       kind 'tap'  a tap at (x, y)
//   swipe.dispose();
//
// A stroke counts once, the moment it is long enough (under the finger, so the gust comes as the child strokes, not when they let
// go), and only while it goes more up than across. Down and side strokes are not strokes.

export const SWIPE = {
  share: 0.2, // of the canvas's height a stroke must go up
};

export function createSwipe(pointer, { height, now = () => 0 } = {}) {
  const heightNow = typeof height === 'function' ? height : () => height;
  const listeners = [];
  let stroke = null; // the drag under way: { x0, y0, dx, dy, counted }

  function emit(event) {
    for (const fn of [...listeners]) {
      try {
        fn(event);
      } catch (error) {
        console.error('[swipe]', error);
      }
    }
  }

  const offDrag = pointer.on('drag', ({ dx, dy, phase, x, y }) => {
    if (phase === 'start') stroke = { x0: x - dx, y0: y - dy, dx: 0, dy: 0, counted: false };
    if (!stroke) return;
    stroke.dx += dx;
    stroke.dy += dy;
    const up = -stroke.dy;
    if (!stroke.counted && up >= SWIPE.share * heightNow() && up > Math.abs(stroke.dx)) {
      stroke.counted = true;
      emit({ kind: 'up', x, y, x0: stroke.x0, y0: stroke.y0, at: now() });
    }
    if (phase === 'end') stroke = null;
  });
  const offTap = pointer.on('tap', ({ x, y }) => emit({ kind: 'tap', x, y }));

  return {
    /** Call fn(event) for every stroke and tap. Returns the function that stops it. */
    on(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    dispose() {
      offDrag();
      offTap();
      listeners.length = 0;
      stroke = null;
    },
  };
}
