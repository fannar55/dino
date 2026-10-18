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
    renderer.setPixelRatio(Math.min(q.pixelRatio * dynamic, window.devicePixelRatio || 1, q.maxPixelRatio));
    renderer.setSize(w, h, false);
    if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  }

  // Dynamic resolution: average the frame time over about a second; step the render scale down
  // when frames are slow and back up when there is headroom. Off while the clock is frozen.
  let acc = 0;
  let frames = 0;
  function adapt(realDelta, frozen) {
    if (!q.dynamicResolution || frozen) return;
    acc += realDelta;
    frames++;
    if (acc < 1) return;
    const ms = (acc / frames) * 1000;
    acc = 0;
    frames = 0;
    const before = dynamic;
    if (ms > 36) dynamic = Math.max(0.6, dynamic - 0.1);
    else if (ms < 26) dynamic = Math.min(1, dynamic + 0.05);
    if (dynamic !== before) applySize();
  }

  addEventListener('resize', () => applySize());
  return { renderer, applySize, adapt, get resolutionScale() { return dynamic; } };
}
