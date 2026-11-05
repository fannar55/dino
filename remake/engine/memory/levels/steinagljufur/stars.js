// Level 2's stars (Task 7): the evening sky over Sólarsyllan, as one point field (one draw call, no texture: each star is a soft round dot,
// the brightest with a small four-pointed glint, made in the fragment shader). The stars stand on a sphere 450 metres round the camera (inside
// the sky dome's 500 and the camera's far plane of 600), drawn after the sky and tested against the depth of everything else, so a cliff or the
// hillside in front of the sky hides them. They come out one by one (`show`), the first ones where the celebration's cameras look (over the
// hillside wall, away from the setting sun), and stay until the round starts again (`reset`).

const RADIUS = 450;
const COUNT = 190;
// The first stars: low over the hillside (world azimuth from +X toward +Z, degrees; elevation, degrees), where the shots on Sólarsyllan see
// the sky over the wall. Then the rest of the sky fills in.
// (the wide shots look down about 9 degrees with a 35 degree picture, so their sky reaches only about 8 degrees up: the band is low; and it reaches
// round to 270 so that a tall screen, which looks more along the ledge, has a few of them too. Task 7, first run: at 8-24 degrees none was in a picture;
// at 4.5-12 the few in a picture sat in its top 100 pixels, under the HUD: now they come out just over the far haze, between the HUD and the wall)
const FIRST = Object.freeze({ azimuth: [272, 348], elevation: [.9, 6], count: 14 });
// (the rest come out closer and closer behind the first: a fifth of a step apart)
const LATER = .22, LAST = FIRST.count + (COUNT - FIRST.count) * LATER + 1;

const vertexShader = /* glsl */`
attribute float aOrder;
attribute float aSize;
attribute float aPhase;
attribute vec3 aTint;
uniform float uOut;
uniform float uPixel;
uniform float uTime;
varying float vBright;
varying float vGlint;
varying vec3 vTint;
void main() {
  // (a direction on the sphere round the camera, wherever the camera is)
  vec4 mv = viewMatrix * vec4(cameraPosition + position * ${RADIUS.toFixed(1)}, 1.0);
  gl_Position = projectionMatrix * mv;
  float born = smoothstep(aOrder, aOrder + 0.9, uOut);
  // (near the horizon the sky turns to haze: the stars fade into it)
  float high = smoothstep(0.002, 0.014, position.y);
  float twinkle = 0.82 + 0.18 * sin(uTime * (1.3 + fract(aPhase * 7.1) * 1.6) + aPhase * 6.283);
  vBright = born * high * twinkle;
  vGlint = step(4.6, aSize) * born;
  vTint = aTint;
  // (a star swells a little as it comes out, then settles)
  float swell = 1.0 + 0.6 * (1.0 - smoothstep(0.0, 1.0, uOut - aOrder - 0.9)) * born;
  gl_PointSize = vBright > 0.002 ? max(2.5, aSize * uPixel * swell) * (vGlint > 0.0 ? 2.4 : 1.0) : 0.0;
}`;

const fragmentShader = /* glsl */`
varying float vBright;
varying float vGlint;
varying vec3 vTint;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  // a round core with a soft edge; the bright ones have a thin cross of light round it
  float core = vGlint > 0.0 ? 1.0 - smoothstep(0.16, 0.42, r) : 1.0 - smoothstep(0.5, 1.0, r);
  float glint = vGlint > 0.0 ? (max(0.0, 1.0 - abs(p.x) * 9.0) + max(0.0, 1.0 - abs(p.y) * 9.0)) * (1.0 - smoothstep(0.2, 1.0, r)) * 0.55 : 0.0;
  float a = clamp(core + glint, 0.0, 1.0) * vBright;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vTint * a, a);
}`;

export function createStars({ THREE, scene }) {
  // (a fixed seed: the same sky every round)
  let seed = 7351;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const position = new Float32Array(COUNT * 3), order = new Float32Array(COUNT), size = new Float32Array(COUNT), phase = new Float32Array(COUNT), tint = new Float32Array(COUNT * 3);
  const deg = Math.PI / 180;
  for (let i = 0; i < COUNT; i++) {
    let azimuth, elevation;
    if (i < FIRST.count) {
      // the first ones spread along the band the cameras see, each in its own slice of it so that no two come out on top of each other
      const slice = (FIRST.azimuth[1] - FIRST.azimuth[0]) / FIRST.count, k = (i * 5) % FIRST.count;
      azimuth = FIRST.azimuth[0] + slice * (k + .2 + .6 * rand());
      elevation = FIRST.elevation[0] + (FIRST.elevation[1] - FIRST.elevation[0]) * rand();
    } else {
      // the rest over the whole sky above the haze, more of them low (where the cameras look) than overhead
      azimuth = 360 * rand();
      elevation = 1.5 + 83.5 * Math.pow(rand(), 1.7);
    }
    const a = azimuth * deg, e = elevation * deg;
    position.set([Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)], i * 3);
    // the first ones come one by one, a whole step apart; the rest closer and closer behind them
    order[i] = i < FIRST.count ? i : FIRST.count + (i - FIRST.count) * LATER;
    size[i] = i < FIRST.count ? (i < 6 ? 7.2 : 6.2) - .6 * rand() : 2.6 + 2.2 * Math.pow(rand(), 2.2);
    phase[i] = rand();
    // mostly white, a few a little blue and a few a little warm
    const t = rand();
    tint.set(t < .2 ? [.82, .9, 1] : t > .88 ? [1, .92, .78] : [1, .98, .94], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aOrder', new THREE.BufferAttribute(order, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const uniforms = { uOut: { value: 0 }, uPixel: { value: 1 }, uTime: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthTest: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Stjörnurnar';
  points.frustumCulled = false; points.visible = false; points.renderOrder = 1001;
  // (the size of a star in pixels follows the height of the picture: about the same on a phone as on a laptop, and never under 2 pixels)
  const buffer = new THREE.Vector2();
  points.onBeforeRender = renderer => { renderer.getDrawingBufferSize(buffer); uniforms.uPixel.value = Math.max(1, Math.min(3.2, buffer.y / 800)); };
  scene.add(points);

  // How far out they are: `out` (in steps of the first stars' order), going on to `target` along an ease-in curve over `seconds`.
  let out = 0, from = 0, target = 0, age = 0, seconds = 0, time = 0, announced = 0;
  const events = [];
  return {
    /** The stars come out over `duration` seconds (the first slowly, one by one, the rest faster); at once with `duration` 0. */
    show(duration = 10) { from = out; target = LAST; age = 0; seconds = Math.max(.01, duration); points.visible = true; },
    update(dt) {
      time += dt; uniforms.uTime.value = time;
      if (out < target) {
        age += dt; const u = Math.min(1, age / seconds);
        // (slow at first, so that the first few come out one at a time, then faster)
        out = from + (target - from) * u * u * (.55 + .45 * u); uniforms.uOut.value = out;
        while (announced < FIRST.count && out >= announced + .45) events.push({ type: 'star-out', index: announced++ });
      }
    },
    /** The stars that have just come out (each of the first ones: the level plays a chime). */
    poll() { return events.splice(0); },
    reset() { out = from = target = 0; age = seconds = 0; announced = 0; events.length = 0; uniforms.uOut.value = 0; points.visible = false; },
    debug: () => ({ out: +out.toFixed(2), visible: points.visible, count: COUNT }),
    first: FIRST.count,
    points,
    dispose() { scene.remove(points); geometry.dispose(); material.dispose(); },
  };
}
