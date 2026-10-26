import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { reducedMotion, TAP_SLOP_PX } from './fx.js';

// The 3D page (spec section 3.4): a card page whose picture is a model the child can turn. The card viewer (card-viewer.js) lays this
// view's canvas over the page's photo, where the picture lies until the model is there, and asks it to show the page's GLB.
//
// The model is drawn as it is, with its own materials, in a small three.js view of its own with a transparent canvas, as Kambeðla's
// is in "Eitt!" (engine/eitt/kambedla-view.js): a perspective camera that frames the model's bounding sphere, so it never leaves the
// frame while it turns, and a hemisphere light and one directional light. The renderer is made when a model is first asked for, and
// its own requestAnimationFrame loop runs only between show and hide, so a closed card costs nothing. A model that is loaded is kept
// for each src for the page's life, and a model that will not load (or a tablet with no WebGL) makes `show` resolve false, so the
// card keeps its picture.
//
// The model turns slowly by itself until the first touch (never, when the tablet asks for less motion). One finger turns it about
// its vertical, a little, and tilts it, never past TILT_MAX; two fingers that both move pinch it from 1 to 3 times. Fingers count one by
// one as in zoom.js: a finger that has not moved TAP_SLOP_PX moves nothing, so a thumb resting on the glass turns nobody's model and
// makes no pinch. A turning finger stays with the canvas wherever it slides (pointer capture), and the browser keeps its own gestures
// out of it (book.css, .card-model: touch-action none). On this page the card viewer lets only the arrows flip, so a finger turns the
// model and never the page. The look of the canvas is book.css's.

export const AUTO_TURN = 0.25; // radians a second
export const DRAG_TURN = 0.008; // radians a pixel
export const TILT_MAX = THREE.MathUtils.degToRad(35);
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
const FOV = 30; // degrees, up and down
const MAX_PIXEL_RATIO = 1.5;
const WHEEL_STEP = 1.2; // a notch of a mouse wheel, for trying the pinch on a laptop
const START_YAW = 0.6; // radians: the model starts turned a little away from side-on, and from level
const START_TILT = THREE.MathUtils.degToRad(8);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Lets go of what a model holds on the graphics card. */
function release(root) {
  root.traverse(object => {
    object.geometry?.dispose();
    for (const material of [object.material].flat()) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

/**
 * The model view, its canvas (made here, put in the page by mount). `loadModel(src)` resolves the glTF for a path (read from the
 * page's folder, as the cards' pictures are); without one the GLTFLoader loads it. Returns
 *   mount(container)   puts the canvas in `container`, hidden until a model shows (the card's photo is its place)
 *   show(src)          resolves true once the model is drawn on the canvas, which shows then; false when it cannot be (no WebGL,
 *                      a model that will not load) or when hide, or a show of another model, came first
 *   hide()             the canvas goes and nothing is drawn; the model stays for next time
 *   dispose()          everything is let go
 */
export function createSkeletonView(doc, { win = globalThis.window, loadModel = null } = {}) {
  const canvas = doc.createElement('canvas');
  canvas.className = 'card-model';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;

  const models = new Map(); // src -> the promise of its { holder, radius }, kept once it is loaded
  let loader = null;
  let stage = null; // { renderer, camera, pivot }, made at the first show
  let broken = false; // the renderer could not be made: it is not tried again
  let token = 0; // each show and hide takes the next: an answer that comes late finds it is no longer its turn
  let shown = null; // the model on the canvas: { radius }
  let frameId = 0;
  let last = 0;
  let watcher = null;
  let yaw = START_YAW;
  let tilt = START_TILT;
  let zoom = MIN_ZOOM;
  let touched = false; // a finger has been on it: it stops turning by itself
  let calm = false; // the tablet asks for less motion: it does not turn by itself at all
  const fingers = new Map(); // pointerId -> { x0, y0, x, y, moved }
  let pinch = null; // the two fingers that pinch, and how far apart they were and how big the model was when they began

  /** The renderer, the camera and the lights, made once; null when this page cannot draw (no canvas to draw on, no WebGL). */
  function makeStage() {
    if (stage || broken) return stage;
    try {
      if (typeof canvas.getContext !== 'function') throw new Error('no canvas to draw on');
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const key = new THREE.DirectionalLight('#fff0d8', 2.4);
      key.position.set(-2, 3, 4);
      scene.add(new THREE.HemisphereLight('#dfeaf2', '#b9a77c', 1.7), key);
      const pivot = new THREE.Group(); // the model turns on this, about its own middle
      scene.add(pivot);
      stage = { renderer, scene, camera: new THREE.PerspectiveCamera(FOV, 4 / 3, 0.1, 100), pivot };
      if (typeof ResizeObserver === 'function') {
        watcher = new ResizeObserver(() => { if (shown) { resize(); draw(); } });
        watcher.observe(canvas);
      }
    } catch {
      broken = true;
    }
    return stage;
  }

  /** The glTF for `src`, as a holder whose middle is at its own origin, and the radius of the sphere round it. */
  function load(src) {
    if (!models.has(src)) {
      const loading = Promise.resolve((loadModel ?? (path => (loader ??= new GLTFLoader()).loadAsync(path)))(src)).then(gltf => {
        const model = gltf.scene ?? gltf.scenes?.[0];
        const box = new THREE.Box3().setFromObject(model);
        if (!model || box.isEmpty()) throw new Error(`${src} has nothing to show`);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        model.position.sub(sphere.center);
        return { holder: new THREE.Group().add(model), radius: Math.max(sphere.radius, 1e-3) };
      });
      loading.catch(() => models.delete(src)); // a model that would not load may be tried again at the next visit
      models.set(src, loading);
    }
    return models.get(src);
  }

  /** The canvas follows the size it has on the page, at up to MAX_PIXEL_RATIO times the CSS pixels. */
  function resize() {
    const { renderer, camera } = stage;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, win?.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // It stands back far enough that the whole sphere is in the narrower way of the frame, whatever way the model faces.
    const half = Math.min(THREE.MathUtils.degToRad(FOV) / 2, Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * camera.aspect));
    const distance = shown.radius / Math.sin(half);
    camera.position.set(0, 0, distance);
    camera.near = Math.max(distance * 0.05, distance - shown.radius * 1.1);
    camera.far = distance + shown.radius * 1.1;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  function draw() {
    const { renderer, scene, camera, pivot } = stage;
    pivot.rotation.set(tilt, yaw, 0);
    if (camera.zoom !== zoom) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }

  function loop(now) {
    frameId = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!touched && !calm) yaw += AUTO_TURN * dt;
    draw();
  }

  /** The canvas goes, and nothing is drawn. */
  function stop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    shown = null;
    canvas.hidden = true;
    fingers.clear();
    pinch = null;
    stage?.pivot.clear();
  }

  // ---- Fingers -------------------------------------------------------------------------------------------------------

  canvas.addEventListener('pointerdown', event => {
    if (!shown || event.button > 0) return;
    touched = true;
    fingers.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, moved: false });
    try {
      canvas.setPointerCapture?.(event.pointerId); // so the finger goes on turning wherever it slides
    } catch {
      // the pointer is already gone
    }
  });
  canvas.addEventListener('pointermove', event => {
    const finger = fingers.get(event.pointerId);
    if (!finger || !shown) return;
    const dx = event.clientX - finger.x;
    const dy = event.clientY - finger.y;
    finger.x = event.clientX;
    finger.y = event.clientY;
    if (!finger.moved) {
      if (Math.hypot(finger.x - finger.x0, finger.y - finger.y0) < TAP_SLOP_PX) return; // a finger at rest moves nothing
      finger.moved = true; // it moves the model from here on, from where it is
      pinch = null;
      return;
    }
    const movers = [...fingers.entries()].filter(([, other]) => other.moved).slice(0, 2); // a still finger is not one of them
    if (movers.length < 2) {
      yaw += dx * DRAG_TURN;
      tilt = clamp(tilt + dy * DRAG_TURN, -TILT_MAX, TILT_MAX);
      return;
    }
    const [a, b] = movers.map(([, other]) => other);
    const apart = Math.hypot(a.x - b.x, a.y - b.y);
    const key = movers.map(([id]) => id).join();
    if (pinch?.key !== key) pinch = { key, apart, zoom }; // a fresh start when these are not the two before
    if (pinch.apart > 1) zoom = clamp(pinch.zoom * (apart / pinch.apart), MIN_ZOOM, MAX_ZOOM);
  });
  const lift = event => {
    fingers.delete(event.pointerId);
    pinch = null; // the finger that is left turns the model from where it is
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', event => {
    if (!shown) return;
    event.preventDefault?.();
    touched = true;
    zoom = clamp(zoom * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), MIN_ZOOM, MAX_ZOOM);
  }, { passive: false });

  return {
    canvas,
    mount(container) {
      container.append(canvas);
    },
    async show(src) {
      const mine = ++token;
      stop();
      if (!makeStage()) return false;
      let loaded;
      try {
        loaded = await load(src);
      } catch {
        return false; // the picture stays
      }
      if (mine !== token) return false; // the page was turned, or the card shut, while it loaded
      shown = loaded;
      stage.pivot.add(loaded.holder);
      yaw = START_YAW;
      tilt = START_TILT;
      zoom = MIN_ZOOM;
      touched = false;
      calm = reducedMotion(win);
      last = 0;
      canvas.hidden = false;
      resize();
      draw(); // drawn before it is shown, so the picture is never replaced by a blank
      frameId = requestAnimationFrame(loop);
      return true;
    },
    hide() {
      token++;
      stop();
    },
    dispose() {
      token++;
      stop();
      watcher?.disconnect();
      canvas.remove();
      for (const loading of models.values()) loading.then(({ holder }) => release(holder), () => {});
      models.clear();
      stage?.renderer.dispose();
      stage?.renderer.forceContextLoss?.();
      stage = null;
      broken = true; // a view that is disposed shows nothing more
    },
  };
}
