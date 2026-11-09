import * as THREE from 'three';

// WebGL2 renderer with the remake's colour pipeline: linear working space, sRGB output, and
// Khronos PBR Neutral tone mapping, which keeps the painted Tripo colours close to their source.
export function createRenderer(canvas, q) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = q.shadowSize > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // three resets renderer.info between the shadow pass and the main pass, which hides the shadow
  // pass from the budget. The frame loop resets it once per frame instead (see main.js render()).
  renderer.info.autoReset = false;

  let dynamic = 1;
  const camera = { current: null };

  function applySize(cam = camera.current) {
    camera.current = cam;
    const w = Math.max(1, canvas.clientWidth || innerWidth);
    const h = Math.max(1, canvas.clientHeight || innerHeight);
    renderer.setPixelRatio(ratioAt(dynamic));
    renderer.setSize(w, h, false);
    if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  }

  // The pixel ratio at a render scale: the preset's, times the scale, never past the screen's own; past the preset's
  // maxPixelRatio only as far as a scale over 1 takes it (q.maxScale, engine/quality.js RESOLUTION_CAP).
  function ratioAt(scale) {
    return Math.min(q.pixelRatio * scale, window.devicePixelRatio || 1, q.maxPixelRatio * Math.max(1, scale));
  }

  // Dynamic resolution: average the frame time over about a second; step the render scale down
  // when frames are slow and back up when there is headroom, to 1. Over 1 (to q.maxScale, on a
  // screen sharper than the canvas) it climbs only while frames come at about the display's own
  // rate (FAST_MS) and steps back as soon as they do not (SLOW_MS); a scale that was too slow is
  // the ceiling for HOLD seconds, so the canvas is not resized back and forth. Off while the
  // clock is frozen.
  const FAST_MS = 18.5; // a frame every 18.5 ms or sooner: about 54 fps or more
  const SLOW_MS = 21; // slower than about 48 fps over 1: one step back
  const HOLD = 20; // s
  let acc = 0;
  let frames = 0;
  let clock = 0;
  let ceiling = Infinity;
  let ceilingUntil = 0;
  const step = (scale, by) => Math.round((scale + by) * 100) / 100;
  function adapt(realDelta, frozen) {
    if (!q.dynamicResolution || frozen) return;
    acc += realDelta;
    clock += realDelta;
    frames++;
    if (acc < 1) return;
    const ms = (acc / frames) * 1000;
    acc = 0;
    frames = 0;
    const before = dynamic;
    const top = Math.min(q.maxScale ?? 1, clock < ceilingUntil ? ceiling : Infinity);
    if (ms > 36) dynamic = Math.max(0.6, step(dynamic, -0.1));
    else if (dynamic > 1 && ms > SLOW_MS) dynamic = Math.max(1, step(dynamic, -0.05));
    else if (dynamic < 1 && ms < 26) dynamic = Math.min(1, step(dynamic, 0.05));
    else if (dynamic >= 1 && ms < FAST_MS && ratioAt(step(dynamic, 0.05)) > ratioAt(dynamic)) dynamic = Math.min(top, step(dynamic, 0.05));
    if (before > 1 && dynamic < before) {
      ceiling = Math.max(1, dynamic);
      ceilingUntil = clock + HOLD;
    }
    if (dynamic !== before) applySize();
  }

  addEventListener('resize', () => applySize());
  return { renderer, applySize, adapt, get resolutionScale() { return dynamic; } };
}
