import { pressable, reducedMotion, TAP_SLOP_PX } from './fx.js';
import { ICONS } from './icons.js';

// The picture zoom (spec section 3.4): a tap on a card's picture lets it grow from where it lies to the whole screen, on a cream
// mat, with a whoosh; a tap anywhere on it, or the big close, lets it shrink back with another. At full size a pinch zooms between 1
// and 4 times and a drag pans, never past the picture's edges, so the picture is always on the screen.
//
// Motion is transform and opacity only (the Web Animations API for the way in and out, and the frame's own transform for the pinch
// and the drag). Fingers count one by one, as in fx.js: a finger at rest drags nothing, so a thumb holding the tablet does not
// make a drag into a pinch (a pinch is two fingers that both move), and a tap is a finger that lifts within TAP_SLOP_PX of where it
// landed without a drag or a pinch going on. A tap while the picture is still growing turns it round from where it has got to.
// The frame's size comes from the picture's own shape (--ratio, book.css .zoom-frame).
//
// A 3D page's model goes to the whole screen the same way (openModel; the owner's wish, 2026-10-26): its canvas (skeleton-view.js)
// is carried from the card to the frame, the frame grows from where the canvas lay, and the canvas keeps its own fingers, so one
// finger turns the model and two pinch it there too; the frame itself is not panned or pinched. A tap shuts it as it shuts a
// picture, and once the frame is back where the canvas lay, `back` puts the canvas back on its card.

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
const IN_MS = 380;
const OUT_MS = 300;
const IN_EASE = 'cubic-bezier(.2, .8, .2, 1)';
const OUT_EASE = 'cubic-bezier(.5, 0, .8, .4)';
const WHEEL_STEP = 1.2; // a notch of a mouse wheel, for trying it on a laptop
const SAFETY_MS = 300; // a page that is not being drawn (a hidden tab) never runs its animations: the state goes on without them

/** The part of an <img> that shows the picture: the picture is fitted in its box (object-fit: contain), so the box is larger. */
function visibleRect(img) {
  const box = img.getBoundingClientRect();
  const { naturalWidth: w, naturalHeight: h } = img;
  if (!(w > 0 && h > 0 && box.width > 0 && box.height > 0)) return box;
  const fit = Math.min(box.width / w, box.height / h);
  return { left: box.left + (box.width - w * fit) / 2, top: box.top + (box.height - h * fit) / 2, width: w * fit, height: h * fit };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The zoom inside `root` (the book's #book, where the container units of book.css size it), with the book's sound (`audio`).
 * Returns
 *   open(img)       zooms the <img> of a card up to the screen; false when a picture is zoomed already
 *   openModel(canvas, back)  takes a 3D page's canvas up to the screen; back() is told when it may go back to its card
 *   close(instant)  puts it back where it lies (instant: at once, as when the book is shut); false when none is open
 *   isOpen          whether a picture is zoomed (until it is back in its place)
 */
export function createZoom(doc, { audio = null, win = globalThis.window, root = doc.getElementById('book') } = {}) {
  if (!root) throw new Error('The zoom needs #book on the page (see index.html)');
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };

  const layer = make('div', 'zoom');
  layer.hidden = true;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'Stór mynd');
  const frame = make('div', 'zoom-frame');
  const picture = doc.createElement('img');
  picture.alt = '';
  picture.draggable = false;
  frame.append(picture);
  const closeButton = make('button', 'zoom-close chunky');
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', 'Loka myndinni');
  closeButton.innerHTML = ICONS.close;
  layer.append(frame, closeButton);
  root.append(layer);

  let isOpen = false;
  let closing = false;
  let source = null; // the card's <img> it came from and goes back to
  let held = null; // a model's canvas the frame holds instead: { canvas, home (the rectangle it lay in), back }
  let view = { scale: 1, x: 0, y: 0 }; // how the pinch and the drag have the frame: scaled about its middle, and moved
  let motion = null; // the way in or out under way: { animations }
  const fingers = new Map(); // pointerId -> { x0, y0, x, y, moved, disturbed }
  let gesture = null; // the pan or pinch the moving fingers make

  const canAnimate = () => typeof frame.animate === 'function';

  // ---- Where things are ------------------------------------------------------------------------------------------------

  /** The middle of the screen, which the frame is centred on. */
  function middle() {
    const area = layer.getBoundingClientRect();
    return { x: area.left + area.width / 2, y: area.top + area.height / 2 };
  }

  /** The transform that lays the frame over `rect`, as small as that, with its picture (or model) on it. Measured with no transform on the frame. */
  function over(rect) {
    const box = (held?.canvas ?? picture).getBoundingClientRect();
    if (!(rect?.width > 0) || !(box.width > 0)) return 'scale(.8)';
    const scale = rect.width / box.width;
    const dx = rect.left + rect.width / 2 - (box.left + box.width / 2);
    const dy = rect.top + rect.height / 2 - (box.top + box.height / 2);
    return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(4)})`;
  }

  /** How far the scaled frame may be moved from the middle each way: none while it fits the screen, then until its edge meets the screen's. */
  function reach(scale) {
    const area = layer.getBoundingClientRect();
    return {
      x: Math.max(0, (frame.offsetWidth * scale - area.width) / 2),
      y: Math.max(0, (frame.offsetHeight * scale - area.height) / 2),
    };
  }

  function apply() {
    view.scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
    const limit = reach(view.scale);
    view.x = clamp(view.x, -limit.x, limit.x);
    view.y = clamp(view.y, -limit.y, limit.y);
    frame.style.setProperty('transform', `translate(${view.x.toFixed(1)}px, ${view.y.toFixed(1)}px) scale(${view.scale.toFixed(4)})`);
  }

  // ---- Fingers -------------------------------------------------------------------------------------------------------

  /** The pan or pinch the fingers that have moved make now, with a fresh start when it is not the one before. */
  function retarget() {
    const movers = [...fingers.entries()].filter(([, finger]) => finger.moved).map(([id]) => id);
    if (!movers.length) {
      gesture = null;
      return;
    }
    const ids = movers.slice(0, 2); // a still finger is not one of them
    const kind = ids.length === 2 ? 'pinch' : 'pan';
    if (gesture && gesture.kind === kind && gesture.ids.join() === ids.join()) return;
    const [a, b] = ids.map(id => fingers.get(id));
    gesture = { kind, ids, scale: view.scale, x: view.x, y: view.y };
    if (kind === 'pan') {
      Object.assign(gesture, { fx: a.x, fy: a.y });
    } else {
      const centre = middle();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      Object.assign(gesture, {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        px: (mid.x - centre.x - view.x) / view.scale, // the point of the picture under the fingers, which stays under them
        py: (mid.y - centre.y - view.y) / view.scale,
      });
    }
  }

  function drive() {
    if (!gesture) return;
    for (const finger of fingers.values()) finger.disturbed = true; // none of these fingers is a tap any more
    const [a, b] = gesture.ids.map(id => fingers.get(id));
    if (gesture.kind === 'pan') {
      view.x = gesture.x + (a.x - gesture.fx);
      view.y = gesture.y + (a.y - gesture.fy);
    } else if (gesture.d > 1) {
      const centre = middle();
      const scale = clamp(gesture.scale * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.d), MIN_SCALE, MAX_SCALE);
      view.scale = scale;
      view.x = (a.x + b.x) / 2 - centre.x - scale * gesture.px;
      view.y = (a.y + b.y) / 2 - centre.y - scale * gesture.py;
    }
    apply();
  }

  layer.addEventListener('pointerdown', event => {
    if (!isOpen || event.button > 0) return;
    if (event.target === closeButton || closeButton.contains?.(event.target)) return; // the close button taps for itself
    fingers.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, moved: false, disturbed: false });
  });
  layer.addEventListener('pointermove', event => {
    const finger = fingers.get(event.pointerId);
    if (!finger) return;
    finger.x = event.clientX;
    finger.y = event.clientY;
    if (!finger.moved && Math.hypot(finger.x - finger.x0, finger.y - finger.y0) >= TAP_SLOP_PX) finger.moved = true;
    if (!finger.moved || motion || closing) return; // the way in and out are not interrupted by a drag
    if (held) { // the model's canvas turns or pinches the model: no finger down is a tap now, and the frame stays where it is
      for (const other of fingers.values()) other.disturbed = true;
      return;
    }
    retarget();
    drive();
  });
  const lift = event => {
    const finger = fingers.get(event.pointerId);
    if (!finger) return;
    fingers.delete(event.pointerId);
    if (event.type === 'pointerup' && !finger.moved && !finger.disturbed) {
      close(); // a tap
      return;
    }
    if (!motion) retarget(); // the finger that is left carries on from where it is
  };
  layer.addEventListener('pointerup', lift);
  layer.addEventListener('pointercancel', lift);
  layer.addEventListener('wheel', event => {
    if (!isOpen || motion || closing || held) return; // a model's canvas zooms the model with the wheel itself
    event.preventDefault?.();
    const centre = middle();
    const scale = clamp(view.scale * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), MIN_SCALE, MAX_SCALE);
    const px = (event.clientX - centre.x - view.x) / view.scale;
    const py = (event.clientY - centre.y - view.y) / view.scale;
    view.scale = scale;
    view.x = event.clientX - centre.x - scale * px;
    view.y = event.clientY - centre.y - scale * py;
    apply();
  }, { passive: false });

  // ---- In and out ------------------------------------------------------------------------------------------------------

  function halt() {
    for (const animation of motion?.animations ?? []) animation.cancel();
    motion = null;
  }

  /** The picture (or model) is back in its place: the layer is put away, and a model's canvas goes back to its card. */
  function finish() {
    halt();
    layer.hidden = true;
    frame.style.removeProperty('transform');
    isOpen = false;
    closing = false;
    fingers.clear();
    gesture = null;
    if (!held) return;
    const { back } = held;
    held = null;
    frame.classList.remove('model');
    frame.style.removeProperty('--hue');
    back?.();
  }

  /** The frame's shape, from a width and a height, or from the box of what it shows. */
  function shape(w, h, box) {
    frame.style.setProperty('--ratio', w > 0 && h > 0 ? `${w} / ${h}` : box.width > 0 && box.height > 0 ? `${Math.round(box.width)} / ${Math.round(box.height)}` : '4 / 3');
  }

  function open(img) {
    if (isOpen || !img) return false;
    source = img;
    picture.src = img.currentSrc || img.src;
    picture.alt = img.alt || '';
    shape(img.naturalWidth, img.naturalHeight, img.getBoundingClientRect());
    return reveal(() => visibleRect(img));
  }

  function openModel(canvas, back = null) {
    if (isOpen || !canvas) return false;
    const home = canvas.getBoundingClientRect();
    const hue = win?.getComputedStyle?.(canvas)?.getPropertyValue?.('--hue')?.trim(); // the animal's colour, which it lies on (book.css)
    held = { canvas, home, back };
    source = null;
    picture.alt = '';
    frame.classList.add('model'); // book.css: no picture, and the canvas fills the mat
    if (hue) frame.style.setProperty('--hue', hue);
    shape(0, 0, home);
    canvas.classList.add('moved'); // it comes over as it is, with no fade-in (book.css)
    frame.append(canvas);
    return reveal(() => home);
  }

  /** The frame grows from `from()` (where its picture or model lay) to the middle of the screen. */
  function reveal(from) {
    view = { scale: 1, x: 0, y: 0 };
    frame.style.removeProperty('transform');
    layer.hidden = false;
    isOpen = true;
    closing = false;
    fingers.clear();
    gesture = null;
    audio?.sfx?.('zoomIn');
    if (!canAnimate()) return true;
    const animations = reducedMotion(win)
      ? [layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 })]
      : [
        frame.animate([{ transform: over(from()) }, { transform: 'none' }], { duration: IN_MS, easing: IN_EASE }),
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN_MS * 0.7, easing: 'ease-out' }),
      ];
    const mine = { animations };
    motion = mine;
    const settle = () => { if (motion === mine) motion = null; };
    animations[0].onfinish = settle;
    setTimeout(settle, IN_MS + SAFETY_MS)?.unref?.();
    return true;
  }

  function close(instant = false) {
    if (!isOpen || closing) return false;
    if (instant || !canAnimate() || !win?.getComputedStyle) {
      finish();
      return true;
    }
    closing = true;
    audio?.sfx?.('zoomOut');
    const at = win.getComputedStyle(frame).transform; // wherever the way in, or the pinch and drag, has it now
    const shown = Number(win.getComputedStyle(layer).opacity);
    halt();
    frame.style.setProperty('transform', 'none');
    const calm = reducedMotion(win);
    const back = calm ? 'none' : over(held ? held.home : visibleRect(source));
    frame.style.setProperty('transform', at);
    const animations = calm
      ? [layer.animate([{ opacity: shown }, { opacity: 0 }], { duration: 160, fill: 'forwards' })]
      : [
        frame.animate([{ transform: at }, { transform: back }], { duration: OUT_MS, easing: OUT_EASE, fill: 'forwards' }),
        layer.animate([{ opacity: shown }, { opacity: shown, offset: 0.5 }, { opacity: 0 }], { duration: OUT_MS, fill: 'forwards' }),
      ];
    const mine = { animations };
    motion = mine;
    const settle = () => { if (motion === mine) finish(); };
    animations[0].onfinish = settle;
    setTimeout(settle, OUT_MS + SAFETY_MS)?.unref?.();
    return true;
  }

  pressable(closeButton, { audio, sound: null, win, onTap: () => close() }); // close() sounds `zoomOut`

  return {
    open,
    openModel,
    close,
    get isOpen() { return isOpen; },
  };
}
