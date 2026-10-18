// Touch in the book (spec section 3.5; STYLE.md section 10, "Interaction"): every control answers a finger with a squash, a
// sparkle and a sound, and a tap is counted as chapter 1 counts one (engine/input/pointer.js):
//   - a press let go within TAP_SLOP_PX of where it landed is a tap, however long it was held;
//   - a finger that moves TAP_SLOP_PX is no tap (it may be a swipe, which the card viewer and the zoom follow themselves);
//   - every finger counts on its own, so a thumb resting on the glass stops nobody's tap.
// The look is book.css's: .pressable springs back, .pressed is the squash, .book-spark a twinkle. When the tablet asks for less
// motion the press is a short fade (.pressed-fade) and the sparks fade where they are (.book-spark.fade); the sound is the same.

export const TAP_SLOP_PX = 12;
const SPARKS = 8;
const SPARK_MS = 1000; // a spark that never hears its animation end (a page that was hidden) is taken away after this long

/** Does the tablet ask for less motion? False when the window cannot say. */
export function reducedMotion(win) {
  try {
    return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/**
 * `count` sparks burst from the middle of `el` and fade out (book.css animates them), each removing itself when its
 * animation ends. They go on the page's body, over everything, so no control's overflow or transform clips them. With less
 * motion they sit on a ring round the control and only fade. Returns them.
 */
export function sparkle(el, count = SPARKS, win = el?.ownerDocument?.defaultView) {
  const doc = el?.ownerDocument;
  if (!doc?.body || !(count > 0)) return [];
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const reach = Math.max(rect.width, rect.height) / 2;
  const calm = reducedMotion(win);
  const sparks = [];
  for (let i = 0; i < count; i++) {
    const angle = ((i + 0.35 * Math.random()) / count) * 2 * Math.PI;
    const ring = calm ? reach * 0.85 : 0;
    const spark = doc.createElement('span');
    spark.className = calm ? 'book-spark fade' : 'book-spark';
    spark.style.setProperty('left', `${(x + Math.cos(angle) * ring).toFixed(1)}px`);
    spark.style.setProperty('top', `${(y + Math.sin(angle) * ring).toFixed(1)}px`);
    spark.style.setProperty('--delay', `${Math.round(Math.random() * 60)}ms`);
    if (!calm) {
      const travel = reach * 0.7 + 24 + Math.random() * 36; // just past the control's edge
      spark.style.setProperty('--dx', `${(Math.cos(angle) * travel).toFixed(1)}px`);
      spark.style.setProperty('--dy', `${(Math.sin(angle) * travel).toFixed(1)}px`);
      spark.style.setProperty('--spin', `${Math.round(90 + Math.random() * 180)}deg`);
    }
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
    doc.body.append(spark);
    sparks.push(spark);
  }
  const timer = setTimeout(() => sparks.forEach(spark => spark.remove()), SPARK_MS);
  timer?.unref?.(); // in Node (the tests) a timer must not keep the process waiting
  return sparks;
}

/**
 * Makes `el` a control of the book: a finger down squashes it (class `pressed`), and a tap springs it back, sparkles, plays
 * `audio.sfx(sound)` (none when `sound` is null: a control that picks its sound itself) and calls `onTap(event)` with the
 * finger's pointerup. `win` is the window, asked about less motion. Returns the function that undoes it.
 */
export function pressable(el, { audio = null, sound = 'tap', onTap = null, win = globalThis.window } = {}) {
  const presses = new Map(); // pointerId -> { x, y, look }: each finger on the control, where it landed and how the press shows
  el.classList.add('pressable');

  /** Shows the press while any finger is down. */
  function show() {
    const looks = new Set([...presses.values()].map(press => press.look));
    for (const look of ['pressed', 'pressed-fade']) el.classList.toggle(look, looks.has(look));
  }

  /** Forgets a finger, and says how it pressed. */
  function drop(id) {
    const press = presses.get(id);
    if (!press) return null;
    presses.delete(id);
    show();
    return press;
  }

  const moved = (press, event) => Math.hypot(event.clientX - press.x, event.clientY - press.y) >= TAP_SLOP_PX;

  function onDown(event) {
    if (event.button > 0) return; // only the main button counts
    presses.set(event.pointerId, { x: event.clientX, y: event.clientY, look: reducedMotion(win) ? 'pressed-fade' : 'pressed' });
    show();
    try {
      el.setPointerCapture?.(event.pointerId); // so the finger lifts here, wherever it slid
    } catch {
      // the pointer is already gone
    }
  }

  function onMove(event) {
    const press = presses.get(event.pointerId);
    if (press && moved(press, event)) drop(event.pointerId); // no tap now, whatever it does next
  }

  function onUp(event) {
    const press = drop(event.pointerId);
    if (!press || moved(press, event)) return;
    sparkle(el, SPARKS, win);
    if (sound) audio?.sfx?.(sound);
    onTap?.(event);
  }

  const onCancel = event => { drop(event.pointerId); };
  const listeners = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onCancel };
  for (const [type, fn] of Object.entries(listeners)) el.addEventListener(type, fn);
  return () => {
    for (const [type, fn] of Object.entries(listeners)) el.removeEventListener(type, fn);
    presses.clear();
    show();
    el.classList.remove('pressable');
  };
}
