import * as THREE from 'three';

// Þrívídd: red/cyan anaglyph ("the glasses"), drawn into any chapter with ?gler=1 (main.js drawNow).
//
// The scene is drawn once per eye into a render target, from two cameras beside the director's (off-axis, never toe-in: both
// look the same way and share the screen rectangle at the zero-parallax distance D), each tone-mapped and encoded as the screen
// is (see ensureTargets). The composite pass then decodes to linear light, mixes the channels for the lenses (left eye -> red, right eye -> cyan), clamps and encodes sRGB.
//
// strength s is the parallax of things at infinity as a share of the screen width: eye separation e = s * W, where W is the width
// of the view at D. Things nearer than D come out of the screen; nothing cut by a screen edge should be nearer than D.
//
// Everything the game updates per camera (forest culling, character LODs, sky) has already run for the centre camera in update(),
// so both eyes draw the same set of things. The sun's shadow map is drawn once, for the first eye.

const KEY = 'mosi.gler.v1';
const DEFAULTS = { on: false, strength: 0.02, method: 'dubois', glasses: 'cyan', swap: false };
const METHODS = { dubois: 0, half: 1, grey: 2, pass: 3 }; // pass: the left eye as it is (a check against the normal render)
const PLANE = { min: 1.5, max: 60, tau: 0.6 }; // m, m, s

function readSaved() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeSaved(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* no storage: the settings last this visit */ }
}

/** Off-axis stereo frusta for a perspective camera (pure; tests and the chapter use it). */
export function eyeFrusta({ fov, aspect, near }, D, s) {
  const halfH = D * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const halfW = halfH * aspect;
  const e = s * 2 * halfW;
  const k = near / D;
  return {
    e, halfW, halfH,
    left: { l: (-halfW + e / 2) * k, r: (halfW + e / 2) * k, t: halfH * k, b: -halfH * k, x: -e / 2 },
    right: { l: (-halfW - e / 2) * k, r: (halfW - e / 2) * k, t: halfH * k, b: -halfH * k, x: e / 2 },
  };
}

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tLeft, tRight;
  uniform int uMethod, uGlasses;
  varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 linear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
  vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
  void main() {
    vec3 l = linear(texture2D(tLeft, vUv).rgb);
    vec3 r = linear(texture2D(tRight, vUv).rgb);
    vec3 o;
    if (uMethod == 3) o = l;
    else if (uGlasses == 1) o = vec3(lum(l), 0.0, lum(r));
    else if (uMethod == 1) o = vec3(lum(l), r.g, r.b);
    else if (uMethod == 2) o = vec3(lum(l), lum(r), lum(r));
    else o = vec3(
      dot(vec3(0.4561, 0.500484, 0.176381), l) + dot(vec3(-0.0434706, -0.0879388, -0.00155529), r),
      dot(vec3(-0.0400822, -0.0378246, -0.0157589), l) + dot(vec3(0.378476, 0.73364, -0.0184503), r),
      dot(vec3(-0.0152161, -0.0205971, -0.00546856), l) + dot(vec3(-0.0721527, -0.112961, 1.2264), r));
    gl_FragColor = vec4(srgb(clamp(o, 0.0, 1.0)), 1.0);
  }`;

export function createGler({ renderer, display, scene, camera, director, q, params, doc = document }) {
  const saved = { ...DEFAULTS, ...readSaved() };
  const settings = { ...saved };
  // the address wins over what is saved, and is not saved (captures)
  if (params.get('gler') !== null) settings.on = params.get('gler') === '1';
  if (params.get('styrkur') !== null && Number.isFinite(Number(params.get('styrkur')))) settings.strength = Number(params.get('styrkur'));
  if (METHODS[params.get('adferd')] !== undefined) settings.method = params.get('adferd');
  if (['cyan', 'blue'].includes(params.get('gleraugu'))) settings.glasses = params.get('gleraugu');
  if (params.get('vixla') !== null) settings.swap = params.get('vixla') === '1';
  const fromAddress = ['gler', 'styrkur', 'adferd', 'gleraugu', 'vixla'].some(k => params.get(k) !== null);

  let targets = null;
  // MSAA in the eye targets when the preset has antialias; ?glersamples=0 (or 2) to compare the cost
  const SAMPLES = params.get('glersamples') !== null ? Math.max(0, Math.min(8, Number(params.get('glersamples')) || 0)) : q.antialias ? 4 : 0;
  const size = new THREE.Vector2();
  const eyes = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tLeft: { value: null }, tRight: { value: null }, uMethod: { value: 0 }, uGlasses: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // zero-parallax distance
  let plane = null; // current D (m)
  let manual = null; // a chapter's own D, or null to follow the look target
  let jumpNext = true;
  let lastDraw = 0;
  const lastPos = new THREE.Vector3();
  const v = new THREE.Vector3();

  function ensureTargets(w, h) {
    if (targets && targets[0].width === w && targets[0].height === h) return;
    targets?.forEach(t => t.dispose());
    // Each eye is drawn exactly as the screen is: tone-mapped (exposure included) and sRGB-encoded in the shaders, with the
    // transparent layers (mist, light shafts) blended over sRGB values as on the canvas. three r180 does that only for the screen
    // or an XR target (WebGLPrograms: toneMapping, outputColorSpace), so these targets say they are one; internalFormat RGBA8
    // keeps the storage plain 8-bit, so no hardware sRGB conversion happens. The composite decodes to linear light, mixes the
    // channels, clamps and encodes sRGB again. (A linear float target blended the mist in linear light: darks came out hazy.)
    const options = { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: true, samples: SAMPLES, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    targets = [0, 1].map(() => {
      const t = new THREE.WebGLRenderTarget(w, h, options);
      t.texture.internalFormat = 'RGBA8';
      t.isXRRenderTarget = true;
      return t;
    });
  }

  function updatePlane() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastDraw) / 1000);
    lastDraw = now;
    const look = director?.rig?.target ? camera.position.distanceTo(director.rig.target) : 8;
    const goal = THREE.MathUtils.clamp(manual ?? look, PLANE.min, PLANE.max);
    // a cut: the camera jumped further in a frame than any comfortable move goes
    if (camera.position.distanceToSquared(lastPos) > 1.5 * 1.5) jumpNext = true;
    lastPos.copy(camera.position);
    if (jumpNext || plane === null) plane = goal;
    else plane += (goal - plane) * (1 - Math.exp(-dt / PLANE.tau));
    jumpNext = false;
  }

  function placeEyes() {
    camera.updateMatrixWorld();
    const f = eyeFrusta(camera, plane, settings.strength);
    const right = v.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    [f.left, f.right].forEach((fr, i) => {
      const eye = eyes[i];
      eye.position.copy(camera.position).addScaledVector(right, fr.x);
      eye.quaternion.copy(camera.quaternion);
      eye.near = camera.near; eye.far = camera.far; eye.fov = camera.fov; eye.aspect = camera.aspect;
      eye.layers.mask = camera.layers.mask;
      eye.updateMatrixWorld(true);
      eye.projectionMatrix.makePerspective(fr.l, fr.r, fr.t, fr.b, camera.near, camera.far);
      eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
    });
  }

  function draw() {
    display?.flushSize?.(); // a pending resize (dynamic resolution) before the targets are sized
    renderer.getDrawingBufferSize(size);
    ensureTargets(size.x, size.y);
    updatePlane();
    placeEyes();
    const before = renderer.getRenderTarget();
    const auto = renderer.shadowMap.autoUpdate;
    renderer.setRenderTarget(targets[0]);
    renderer.render(scene, eyes[0]);
    renderer.shadowMap.autoUpdate = false; // the sun's shadow once a frame, not once an eye
    renderer.shadowMap.needsUpdate = false;
    try {
      renderer.setRenderTarget(targets[1]);
      renderer.render(scene, eyes[1]);
    } finally {
      renderer.shadowMap.autoUpdate = auto;
    }
    const u = material.uniforms;
    u.tLeft.value = targets[settings.swap ? 1 : 0].texture;
    u.tRight.value = targets[settings.swap ? 0 : 1].texture;
    u.uMethod.value = METHODS[settings.method] ?? 0;
    u.uGlasses.value = settings.glasses === 'blue' ? 1 : 0;
    renderer.setRenderTarget(before);
    renderer.render(quadScene, quadCamera);
  }

  // ---- the parent's panel ----
  const ui = buildPanel();
  function save() {
    if (!fromAddress) writeSaved(settings);
    ui.sync();
  }
  function buildPanel() {
    const style = doc.createElement('style');
    style.textContent = `
      .gler-button { position: fixed; left: max(12px, env(safe-area-inset-left)); bottom: max(12px, env(safe-area-inset-bottom)); z-index: 30;
        font: 700 16px Nunito, sans-serif; padding: 8px 12px; border-radius: 12px; border: 0; background: rgba(255,255,255,.75); color: #333; }
      .gler-panel { position: fixed; left: 12px; bottom: 60px; z-index: 31; background: rgba(255,255,255,.95); color: #222; border-radius: 14px;
        padding: 14px 16px; font: 16px Nunito, sans-serif; display: grid; gap: 10px; min-width: 240px; box-shadow: 0 4px 20px rgba(0,0,0,.25); }
      .gler-panel[hidden], .gler-card[hidden] { display: none; }
      .gler-panel label { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
      .gler-card { position: fixed; inset: 0; z-index: 40; background: #808080; display: grid; place-items: center; align-content: center; gap: 28px; }
      .gler-card .sq { display: flex; gap: 40px; } .gler-card .sq i { width: 160px; height: 160px; display: block; }
      .gler-card p { max-width: 640px; margin: 0 16px; font: 20px/1.4 Nunito, sans-serif; color: #111; background: rgba(255,255,255,.8); padding: 12px 16px; border-radius: 10px; }
      .gler-card button { font: 700 18px Nunito, sans-serif; padding: 10px 20px; border-radius: 12px; border: 0; }`;
    doc.head.append(style);
    const button = Object.assign(doc.createElement('button'), { type: 'button', className: 'gler-button', textContent: '3D' });
    button.setAttribute('aria-label', 'Þrívídd: stillingar');
    const panel = doc.createElement('div');
    panel.className = 'gler-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <label>Þrívídd <input type="checkbox" data-k="on"></label>
      <label>Dýpt <input type="range" min="0" max="0.04" step="0.002" data-k="strength"></label>
      <label>Litaaðferð <select data-k="method"><option value="dubois">Dubois</option><option value="half">Hálfur litur</option><option value="grey">Grátt</option></select></label>
      <label>Gleraugu <select data-k="glasses"><option value="cyan">Rauð og blágræn</option><option value="blue">Rauð og blá</option></select></label>
      <label>Víxla augum <input type="checkbox" data-k="swap"></label>
      <button type="button" data-card>Prufuspjald</button>`;
    const card = doc.createElement('div');
    card.className = 'gler-card';
    card.hidden = true;
    card.innerHTML = `<div class="sq"><i style="background:#f00"></i><i style="background:#0f0"></i><i style="background:#00f"></i></div>
      <p>Með vinstra auga (rauða glerið) á rauði reiturinn að vera ljós og hinir dökkir. Með hægra auga á rauði reiturinn að vera dökkur. Ef græni reiturinn er líka dökkur með hægra auga eru gleraugun rauð og blá: veldu þá „Rauð og blá“.</p>
      <button type="button">Loka</button>`;
    const stop = e => e.stopPropagation(); // the panel's taps are not taps in the world
    for (const el of [button, panel, card]) for (const t of ['pointerdown', 'pointerup', 'click']) el.addEventListener(t, stop);
    button.addEventListener('click', () => { panel.hidden = !panel.hidden; });
    panel.querySelector('[data-card]').addEventListener('click', () => { card.hidden = false; });
    card.querySelector('button').addEventListener('click', () => { card.hidden = true; });
    panel.addEventListener('input', e => {
      const k = e.target.dataset.k;
      if (!k) return;
      settings[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
      save();
    });
    doc.body.append(button, panel, card);
    return {
      sync() {
        for (const el of panel.querySelectorAll('[data-k]')) {
          const val = settings[el.dataset.k];
          if (el.type === 'checkbox') el.checked = Boolean(val); else el.value = String(val);
        }
      },
    };
  }
  ui.sync();

  return {
    settings,
    get on() { return settings.on; },
    get plane() { return plane; },
    eyes,
    /** Turn the glasses on or off (a chapter that needs them turns them on; not saved). */
    enable(on = true) { settings.on = on; ui.sync(); },
    /** The zero-parallax distance in metres, eased; null follows the look target again. `jump` sets it at once (under a fade). */
    setPlane(distance, { jump = false } = {}) { manual = distance ?? null; if (jump) jumpNext = true; },
    draw,
  };
}
