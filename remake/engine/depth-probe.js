// The depth probe (the 3D shows: chapters/gramedla3d.js): how near the scene comes to the centre camera along the frame's border and
// in its middle, as a share of the screen plane's distance D (engine/gler.js), for the comfort rules of a moving 3D show.
//
//   const probe = createDepthProbe(world, { width: 240 });
//   probe.sample(D)   -> { D, border, borderAt, middle, middleAt, wide, wideAt,   (each a share of D; *At: [u, v] in the frame)
//                          front, at, behind, sky, farthest }   (shares of the frame's pixels: in front of the screen (k < 1 − AT),
//                          at it (within AT), behind it, the sky (nothing drawn); and the farthest drawn depth as a share of D)
//   probe.sample(D, { isGround(u, v, depth) })   the border's ground apart: border and borderAt leave out what isGround says is
//                          the ground (by the rules a 3D show keeps, the floor may come nearer at the bottom edge), groundBorder and
//                          groundBorderAt are its nearest
//
// It draws the scene once from world.camera into a small target with a depth texture (the real materials, so the plants' sway and
// the skinned bodies are where they are drawn), turns the depth buffer into view-space depth (distance along the camera's forward,
// which is what the parallax follows: strength · (1 − D / depth)) and reads it back. `border` is the nearest depth in the outer ring
// of pixels (BORDER of the frame's width or height, at least 1 px), `middle` the nearest inside the middle 60 % (u and v 0.2..0.8),
// `wide` the nearest outside it. What it does not see: whatever does not write depth: the transparent particles (the falls' spray,
// the splashes, the mist cards, the speed lines) and any material drawn with depthWrite off. One sample costs a draw of the scene
// at about 240x150 plus a read back (a few ms): only a probe calls it, never a frame of the show.
import * as THREE from 'three';

const BORDER = 0.01;
const MIDDLE = [0.2, 0.8];
const AT = 0.03; // within 3 % of D counts as at the screen

export function createDepthProbe(world, { width = 240 } = {}) {
  const { renderer, scene } = world;
  let target = null;
  let linear = null;
  let size = [0, 0];
  const quadScene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      #include <packing>
      uniform sampler2D tDepth; uniform float uNear, uFar; varying vec2 vUv;
      void main() { float d = texture2D(tDepth, vUv).x; gl_FragColor = vec4(-perspectiveDepthToViewZ(d, uNear, uFar), d, 0.0, 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let pixels = null;

  function ensure(w, h) {
    if (target && size[0] === w && size[1] === h) return;
    target?.dispose();
    linear?.dispose();
    target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType) });
    linear = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false });
    pixels = new Float32Array(w * h * 4);
    size = [w, h];
  }

  function sample(D, { isGround = null } = {}) {
    const camera = world.camera;
    const w = width;
    const h = Math.max(8, Math.round(width / camera.aspect));
    ensure(w, h);
    camera.updateMatrixWorld();
    const before = renderer.getRenderTarget();
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      material.uniforms.tDepth.value = target.depthTexture;
      material.uniforms.uNear.value = camera.near;
      material.uniforms.uFar.value = camera.far;
      renderer.setRenderTarget(linear);
      renderer.render(quadScene, quadCamera);
      renderer.readRenderTargetPixels(linear, 0, 0, w, h, pixels);
    } finally {
      renderer.setRenderTarget(before);
      renderer.shadowMap.autoUpdate = auto;
    }
    const bx = Math.max(1, Math.round(BORDER * w));
    const by = Math.max(1, Math.round(BORDER * h));
    const out = { D, border: Infinity, borderAt: null, groundBorder: Infinity, groundBorderAt: null, middle: Infinity, middleAt: null, wide: Infinity, wideAt: null, size: [w, h] };
    let front = 0, at = 0, behind = 0, sky = 0, farthest = 0;
    for (let y = 0; y < h; y++) {
      const v = 1 - (y + 0.5) / h; // the read back's rows run from the bottom
      for (let x = 0; x < w; x++) {
        const i = 4 * (y * w + x);
        if (pixels[i + 1] >= 1) { sky++; continue; } // nothing drawn there (the clear): the sky beyond the far plane
        const depth = pixels[i];
        if (!(depth > 0)) { sky++; continue; }
        const k = depth / D;
        if (k < 1 - AT) front++; else if (k <= 1 + AT) at++; else behind++;
        if (k > farthest) farthest = k;
        const u = (x + 0.5) / w;
        if (x < bx || x >= w - bx || y < by || y >= h - by) {
          if (isGround?.(u, v, depth)) {
            if (k < out.groundBorder) { out.groundBorder = k; out.groundBorderAt = [+u.toFixed(3), +v.toFixed(3)]; }
          } else if (k < out.border) { out.border = k; out.borderAt = [+u.toFixed(3), +v.toFixed(3)]; }
        }
        if (u >= MIDDLE[0] && u <= MIDDLE[1] && v >= MIDDLE[0] && v <= MIDDLE[1]) {
          if (k < out.middle) { out.middle = k; out.middleAt = [+u.toFixed(3), +v.toFixed(3)]; }
        } else if (k < out.wide) { out.wide = k; out.wideAt = [+u.toFixed(3), +v.toFixed(3)]; }
      }
    }
    const n = w * h;
    Object.assign(out, { front: +(front / n).toFixed(4), at: +(at / n).toFixed(4), behind: +(behind / n).toFixed(4), sky: +(sky / n).toFixed(4), farthest: +farthest.toFixed(3) });
    return out;
  }

  return {
    sample,
    dispose() { target?.dispose(); linear?.dispose(); material.dispose(); quad.geometry.dispose(); },
  };
}
