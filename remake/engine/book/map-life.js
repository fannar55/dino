// The living painting (spec 2026-10-29-lifandi-malverk-design.md, sections 1 to 3): the data, the shader and the layer that make the
// book's map, and the map in the journey, move the painting's own pixels. Nothing is drawn on it and no picture is added: a
// fragment shader reads the painting (assets/book/map.webp) and shows each pixel from a little way off, which is all that moves.
//   the water runs      ripples slide down the river from the fall, right and a little down, about 16 picture pixels a second
//                       (in the Fen, where the water is nearly still, 3), and glints ride the current and twinkle;
//   the fall falls      light streaks run down the fall's stream, whose pixels shake up and down a little (FALL), and the foam at
//                       its foot whitens and boils (FOAM);
//   the trees sway      eighteen tall trees and tree ferns (TREES): each crown turns a little about the foot of its trunk, more the
//                       higher up, each at its own speed, with a gust in it; the foot stands still;
//   the clouds billow   the painted cloud in the top left slides on a slow, wide current where it lies, and two copies of it drift
//                       right across the mountains, each fading in and out half a cycle after the other, so it never jumps;
//                       a round hole (`hole`, Grameðla's) keeps the cloud, moving or drifting, out of her circle once she is found.
// The water, and the cloud, are found by a mask cut from the painting (tools/map-life-layers.py: map-water.webp and map-mist.webp,
// whose alpha is the water and the mist); here the two are one texture, the water in its red channel and the mist in its green.
// This is the shader of the approved throwaway prototype (qa/bokin/kort-lif), its lighter version, with the owner's default look
// (every slider at 1) and without the spray, which was never wanted. The look values are the prototype's: do not retune them
// without the owner. The tree list is its list, verbatim; the fall's and the foam's numbers are written into the shader from FALL
// and FOAM, so the data and the shader cannot drift apart.
//
// Each page of the spread has a layer of its own, `createLiveMap(canvas, { half })`, which draws that page's half of the painting
// (picture x 0 to 840.5, or 840.5 to 1681) on `canvas`. It holds only that half of the painting, in a texture 941 wide: the half and
// 100 picture pixels across the spine, so a tree or a cloud that moves near the spine still has pixels to move. All layers read
// one clock, the page's, so the two halves of a river that crosses the spine are never out of step. The layer is made lazily, with
// WebGL 1 straight (no three.js) in a context of its own, as skeleton-view.js makes the model view's renderer: its pictures are
// loaded when it is made, it draws 30 frames a second between start() and stop() and only once its pictures are in, and the first
// frame it draws is told to `onReady`, so the page can put the layer over the still painting without a blank flash.
//
// Where it cannot be, there is no layer: `createLiveMap` returns null for a canvas that cannot draw, for no WebGL, for a graphics
// card whose fragment shaders have no high-precision floats (the clock and the drift would stutter), and for a shader that will
// not compile or link; and a layer that loses its context (`webglcontextlost`, or a picture that will not load) tells `onLost`
// and never draws again. The page then falls back to the painting with the still mist layer, as it was before the life.
//
// The budget (the plan's global constraints): the life may add at most 4 ms a frame on average at 1366 x 1024 and 1024 x 1366 on the
// owner's laptop (Intel Iris Xe). It is cheap because the noise is one texture fetch from a small tiling texture, each effect is
// worked only inside its own region (the mask, or a box round the fall and the cloud), and each tree tests its box first. The canvas
// is never bigger than the picture's own pixels (841 wide), and `timeLiveMaps` measures what the life costs, for the lab.

const PICTURE = { width: 1681, height: 936 }; // map.webp's pixels
const HALF_WIDTH = PICTURE.width / 2;
const MARGIN = 100; // picture pixels across the spine that each layer holds
const CROP_WIDTH = Math.ceil(HALF_WIDTH) + MARGIN; // 941
const CROPS = [
  [0, 0, CROP_WIDTH, PICTURE.height], // the left page's painting: x 0 to 941
  [PICTURE.width - CROP_WIDTH, 0, CROP_WIDTH, PICTURE.height], // the right page's: x 740 to 1681
];
const VIEWS = [
  [0, 0, HALF_WIDTH, PICTURE.height], // what each page shows, in picture pixels
  [HALF_WIDTH, 0, HALF_WIDTH, PICTURE.height],
];
const MAX_WIDTH = 841; // a canvas is never wider than the picture's own pixels for its half
const MAX_DPR = 2;

export const LIFE_FPS = 30;
export const LIFE_RES = 1; // the canvas's size as a share of the size above: the fallback, if the budget is ever missed, is 0.75
/** The shader's clock, in seconds, for `ms` milliseconds of the page's: it starts over every hour, so a float in the shader stays small. */
export const lifeClock = ms => (ms / 1000) % 3600;
const CLOCK_ZERO = globalThis.performance?.now() ?? 0; // one clock for every layer

const asset = name => new URL(`../../assets/book/${name}`, import.meta.url).href;
// (Not map-page.js's constants: it imports this module.)
const PAINTING_SRC = asset('map.webp');
const WATER_SRC = asset('map-water.webp');
const MIST_SRC = asset('map-mist.webp');

// ---- The data, in picture pixels ----------------------------------------------------------------------------------------------

/**
 * The trees that sway: where the trunk stands (it does not move there), the crown's centre and half its width and height, and how
 * far it leans at most, in degrees. Only the tall ones whose crowns stand out; the rest of the forest is still.
 */
export const TREES = [
  // the three tall conifers on the right page, against the reed
  { p: [1530, 298], c: [1527, 110], r: [78, 48], deg: 0.88 },
  { p: [1462, 300], c: [1458, 185], r: [55, 42], deg: 1.12 },
  { p: [1585, 305], c: [1592, 195], r: [55, 42], deg: 1.12 },
  // the tall conifers of the forest, left page
  { p: [72, 362], c: [68, 235], r: [45, 32], deg: 0.96 },
  { p: [350, 385], c: [355, 255], r: [62, 32], deg: 0.96 },
  { p: [757, 235], c: [757, 117], r: [35, 24], deg: 1.12 },
  { p: [722, 232], c: [722, 150], r: [24, 16], deg: 1.28 },
  // the firs below the mountains
  { p: [615, 160], c: [615, 110], r: [18, 42], deg: 0.96 },
  { p: [655, 158], c: [655, 108], r: [18, 40], deg: 0.96 },
  { p: [152, 262], c: [152, 205], r: [16, 45], deg: 0.96 },
  { p: [182, 268], c: [182, 210], r: [16, 42], deg: 0.96 },
  // the tree ferns and cycads, whose fronds bend more
  { p: [228, 600], c: [225, 462], r: [85, 40], deg: 1.6 },
  { p: [357, 600], c: [355, 478], r: [50, 34], deg: 1.76 },
  { p: [675, 830], c: [672, 635], r: [100, 55], deg: 1.44 },
  { p: [780, 880], c: [772, 740], r: [70, 50], deg: 1.6 },
  { p: [465, 798], c: [467, 710], r: [52, 55], deg: 1.92 },
  { p: [118, 700], c: [117, 635], r: [44, 45], deg: 1.92 },
  { p: [60, 600], c: [62, 495], r: [45, 35], deg: 1.76 },
];
/** The waterfall's stream (its sides and its top and bottom), and the foam at its foot: an ellipse's centre and half axes. */
export const FALL = { left: 431, right: 469, top: 170, bottom: 230 };
export const FOAM = { at: [450, 234], r: [47, 13] };

const CROWN_REACH = 1.18; // how far past its half width and height a crown's sway is felt
const TRUNK_REACH = 12; // how far to either side of its trunk's line

/** The box round a tree's moving part, [left, top, right, bottom]: a pixel outside it costs the shader one test. */
export function treeBox({ p, c, r }) {
  return [
    Math.min(p[0] - TRUNK_REACH, c[0] - CROWN_REACH * r[0]),
    c[1] - CROWN_REACH * r[1],
    Math.max(p[0] + TRUNK_REACH, c[0] + CROWN_REACH * r[0]),
    p[1] + 2,
  ];
}

// ---- The shader ---------------------------------------------------------------------------------------------------------------

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;

const glsl = n => (Number.isInteger(n) ? n.toFixed(1) : String(n)); // a number as a GLSL float
const vec2 = ([x, y]) => `vec2(${glsl(x)}, ${glsl(y)})`;
// The box in which the fall and its foam are worked, as in the prototype: from a little left of the fall to a little right of the
// foam, and from a little above the fall's top to a little below the foam. (Its left edge goes by the fall, not by the foam, which
// reaches 22 pixels further west: that part of the foam is the water's ripple and not the foam's boil, as in the approved look.)
const FALL_BOX = [FALL.left - 6, FOAM.at[0] + FOAM.r[0] + 3, FALL.top - 5, FOAM.at[1] + FOAM.r[1] + 5];

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPaint, uMask, uNoise;
uniform vec4 uCrop; // the painting's pixels that the textures hold: left, top, width, height
uniform vec4 uView; // the part of the painting this page shows: left, top, width, height
uniform float uTime, uLife; // seconds; 1 for every effect, 0 for the painting as it is (for timing the life)
uniform vec4 uTreeA[${TREES.length}]; // trunk foot xy, crown centre xy
uniform vec4 uTreeB[${TREES.length}]; // crown half width and height, lean (radians), phase
uniform vec4 uTreeBox[${TREES.length}]; // the box round each tree's moving part: left, top, right, bottom
uniform vec3 uHole; // the round hole in the cloud: centre xy and radius, 0 when it is shut

vec2 cropUv(vec2 p) { return (p - uCrop.xy) / uCrop.zw; }
vec3 paint(vec2 p) { return texture2D(uPaint, cropUv(p)).rgb; }
float waterAt(vec2 p) { return texture2D(uMask, cropUv(p)).r; }
float mistAt(vec2 p) { return texture2D(uMask, cropUv(p)).g; }
float ell(vec2 p, vec2 c, vec2 r, float a, float b) { return 1.0 - smoothstep(a, b, length((p - c) / r)); }
// four smooth noises in one fetch from a small tiling texture, each about -0.7..0.7, with a feature about one unit of x wide
vec4 nz4(vec2 x) { return (texture2D(uNoise, x * 0.0234375) - 0.5) * 1.4; }
float noise(vec2 x) { return nz4(x).r; }
float fbm(vec2 x) { return 0.62 * nz4(x).g + 0.34 * nz4(x * 2.03 + 7.1).b; }

void main() {
  vec2 p = uView.xy + vUv * uView.zw;
  if (uLife < 0.5) { gl_FragColor = vec4(paint(p), 1.0); return; }
  float t = uTime;
  vec2 off = vec2(0.0);

  // trees: each crown turns a little round the foot of its trunk, more the higher up; a pixel outside a tree's box costs one test
  for (int i = 0; i < ${TREES.length}; i++) {
    vec4 box = uTreeBox[i];
    if (p.x < box.x || p.x > box.z || p.y < box.y || p.y > box.w) continue;
    vec2 P = uTreeA[i].xy, C = uTreeA[i].zw, R = uTreeB[i].xy;
    float top = C.y - R.y;
    float h = clamp((P.y - p.y) / max(P.y - top, 1.0), 0.0, 1.0);
    float xc = mix(P.x, C.x, h);
    float trunk = (1.0 - smoothstep(5.0, ${glsl(TRUNK_REACH)}, abs(p.x - xc))) * step(top, p.y);
    float crown = ell(p, C, R * ${glsl(CROWN_REACH)}, 0.72, 1.0);
    float w = max(crown, trunk) * pow(h, 1.3);
    if (w <= 0.0) continue;
    float ph = uTreeB[i].w;
    float sp = 0.75 + fract(ph * 0.37) * 0.5;
    float a = uTreeB[i].z * (sin(t * 0.9 * sp + ph) + 0.35 * sin(t * 2.3 * sp + ph * 1.7)) * w;
    vec2 d = p - P;
    float cs = cos(a), sn = sin(a);
    off += P + vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y) - p;
  }

  vec2 q = p + off;
  float wat = waterAt(q);
  float stream = 0.0, foam = 0.0, pool = 0.0;
  vec2 flow = vec2(0.0);
  if (wat > 0.004) {
    if (q.x > ${glsl(FALL_BOX[0])} && q.x < ${glsl(FALL_BOX[1])} && q.y > ${glsl(FALL_BOX[2])} && q.y < ${glsl(FALL_BOX[3])}) { // the fall and its foam
      stream = wat * (smoothstep(${glsl(FALL.left)}, ${glsl(FALL.left + 6)}, q.x) - smoothstep(${glsl(FALL.right - 6)}, ${glsl(FALL.right)}, q.x))
        * (smoothstep(${glsl(FALL.top)}, ${glsl(FALL.top + 9)}, q.y) - smoothstep(${glsl(FALL.bottom - 8)}, ${glsl(FALL.bottom)}, q.y));
      foam = ell(q, ${vec2(FOAM.at)}, ${vec2(FOAM.r)}, 0.45, 1.0) * wat;
    }
    pool = wat * (1.0 - stream) * (1.0 - foam);
    // the river runs right and a little down from the fall; the Fen's water barely drifts
    float fen = smoothstep(860.0, 980.0, q.x);
    flow = mix(vec2(15.4, 4.3), vec2(3.0, 2.0), fen);
    if (pool > 0.0) {
      vec2 s = q - flow * t;
      vec2 n = nz4(s * 0.07).rg + 0.5 * nz4(s * 0.16 + vec2(t * 0.3, -t * 0.3)).ba;
      q += n * mix(1.7, 1.0, fen) * pool;
    }
    if (stream + foam > 0.0) {
      q.y += noise(vec2(q.x * 0.35, q.y * 0.05 - t * 3.5)) * 3.0 * stream;
      q += nz4(q * 0.22 + vec2(t * 1.7, -t * 1.9)).gb * 1.8 * foam;
    }
  }
  vec3 col = paint(q);

  if (pool > 0.0) { // glints that ride the current and twinkle
    vec2 s = q - flow * t * 1.15;
    float g = smoothstep(0.22, 0.5, nz4(s * 0.085).a) * smoothstep(0.1, 0.45, nz4(q * 0.21 + vec2(t * 0.8, -t * 0.6)).g);
    col += g * 0.32 * pool * vec3(1.0, 1.0, 0.95);
  }
  if (stream + foam > 0.0) { // light streaks falling down the fall, the foam boiling white
    float streak = smoothstep(0.0, 0.45, nz4(vec2(q.x * 0.55, q.y * 0.045 - t * 5.0)).b);
    col = mix(col, vec3(0.95, 0.98, 1.0), streak * 0.4 * stream);
    float bub = smoothstep(0.05, 0.45, nz4(q * 0.2 + vec2(0.0, -t * 1.4)).a);
    col = mix(col, vec3(1.0), bub * 0.35 * foam);
  }
  if (p.x < 960.0 && p.y < 290.0) { // the cloud is in the top left only
    float hole = uHole.z > 0.0 ? smoothstep(uHole.z, uHole.z * 1.35, distance(p, uHole.xy)) : 1.0;
    // the painted cloud billows where it lies: its pixels (and the edges of the slopes they touch) slide on a slow, wide current
    float here = mistAt(p);
    if (here > 0.004) {
      vec2 billow = nz4(p * 0.009 - vec2(t * 0.035, 0.0)).rg * 9.0 * here * hole;
      col = mix(col, paint(p + billow), here * hole);
    }
    // and two copies of it drift right across the mountains, each fading in and out, half a cycle apart, so the drift never jumps
    float T = 36.0;
    vec3 acc = vec3(0.0);
    float aw = 0.0;
    for (int k = 0; k < 2; k++) {
      float s = fract(t / T + float(k) * 0.5);
      vec2 src = p - vec2((s - 0.5) * 170.0, sin(s * 6.2831) * 4.0);
      float m = mistAt(src);
      if (m < 0.004) continue;
      float wisp = smoothstep(-0.2, 0.3, fbm(src * 0.011 + vec2(float(k) * 7.0, 0.0)));
      float a = m * sin(s * 3.14159) * wisp;
      acc += mix(paint(src), vec3(0.97, 0.97, 0.96), 0.25) * a;
      aw += a;
    }
    if (aw > 0.001) col = mix(col, acc / aw, clamp(aw * 1.2, 0.0, 1.0) * 0.8 * hole);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---- The pictures: the noise, the painting and the mask -----------------------------------------------------------------------

/** A small seeded random generator (mulberry32): the noise, and so the look, is the same on every run. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small tiling texture of four smooth noises (white noise blurred, wrapping round), RGBA bytes, N by N. */
function noiseData(N = 256, R = 3) {
  const random = mulberry32(7);
  // a box blur of 2R + 1 pixels along rows or down columns, wrapping round, by a running sum (one add and one take away a pixel)
  const blur = (src, horizontal) => {
    const out = new Float32Array(N * N);
    const along = horizontal ? 1 : N; // the step from a pixel to the next one in the direction of the blur
    const across = horizontal ? N : 1; // and from one line to the next
    for (let line = 0; line < N; line++) {
      const from = line * across;
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += src[from + ((k + N) % N) * along];
      for (let i = 0; i < N; i++) {
        out[from + i * along] = sum / (2 * R + 1);
        sum += src[from + ((i + R + 1) % N) * along] - src[from + ((i - R + N) % N) * along];
      }
    }
    return out;
  };
  const data = new Uint8Array(N * N * 4);
  for (let c = 0; c < 4; c++) {
    let a = Float32Array.from({ length: N * N }, () => random());
    for (let pass = 0; pass < 2; pass++) a = blur(blur(a, true), false);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of a) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    for (let i = 0; i < N * N; i++) data[i * 4 + c] = Math.round((a[i] - lo) / (hi - lo) * 255);
  }
  return data;
}
let noiseBytes = null; // made at the first layer, and shared: it is the same for all
const NOISE_SIZE = 256;

// ---- The layers ---------------------------------------------------------------------------------------------------------------

const made = new Set(); // each layer made and not yet let go: { ready(), frame(seconds, life), wait() }, for timeLiveMaps

/** The program from the two shaders, or null when either will not compile or they will not link. */
function buildProgram(gl) {
  const shaders = [];
  try {
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
  } catch {
    return null;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

/** A texture on a unit, filtered smoothly, wrapping as told (the painting's and the mask's sizes are not powers of two: they clamp). */
function makeTexture(gl, unit, wrap) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return texture;
}

/**
 * The living layer for one page of the map, drawn on `canvas` (its CSS size decides how big it is drawn; see draw below), or null
 * where it cannot be made (see the top of the file).
 *   half     0 for the left page, 1 for the right
 *   win      the window, for its animation frames, its pixel ratio and its documents
 *   hole     asked once a frame for the round hole in the cloud, [x, y, r] in picture pixels (r 0 while it is shut)
 *   onReady  told once, after the first frame is drawn
 *   onLost   told if the layer can no longer draw (the context was lost, or its pictures would not load): it never draws again
 * Returns
 *   start()    begins drawing, 30 frames a second, once the pictures are in
 *   stop()     draws nothing more until the next start
 *   destroy()  stops, lets go of the graphics context, and forgets the layer
 *   running    whether the loop is going
 */
export function createLiveMap(canvas, { half, win = globalThis.window, hole = () => [0, 0, 0], onReady = () => {}, onLost = () => {} } = {}) {
  if (typeof canvas?.getContext !== 'function' || !CROPS[half] || typeof win?.requestAnimationFrame !== 'function') return null;
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const loseContext = () => gl.getExtension?.('WEBGL_lose_context')?.loseContext();
  // a card whose fragment shaders have no high-precision floats cannot keep the clock and the drift smooth
  const program = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ? buildProgram(gl) : null;
  if (!program) {
    loseContext();
    return null;
  }

  const crop = CROPS[half];
  gl.useProgram(program);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const uniform = name => gl.getUniformLocation(program, name);
  gl.uniform1i(uniform('uPaint'), 0);
  gl.uniform1i(uniform('uMask'), 1);
  gl.uniform1i(uniform('uNoise'), 2);
  gl.uniform4fv(uniform('uCrop'), crop);
  gl.uniform4fv(uniform('uView'), VIEWS[half]);
  // each tree: its feet and crown, its size, lean and phase (each swaying at its own pace), and the box round its moving part
  const treeA = new Float32Array(TREES.length * 4);
  const treeB = new Float32Array(TREES.length * 4);
  const treeBoxes = new Float32Array(TREES.length * 4);
  TREES.forEach((tree, i) => {
    treeA.set([tree.p[0], tree.p[1], tree.c[0], tree.c[1]], i * 4);
    treeB.set([tree.r[0], tree.r[1], tree.deg * Math.PI / 180, (i * 2.399) % (Math.PI * 2)], i * 4);
    treeBoxes.set(treeBox(tree), i * 4);
  });
  gl.uniform4fv(uniform('uTreeA'), treeA);
  gl.uniform4fv(uniform('uTreeB'), treeB);
  gl.uniform4fv(uniform('uTreeBox'), treeBoxes);
  const uTime = uniform('uTime');
  const uLife = uniform('uLife');
  const uHole = uniform('uHole');
  const pixel = new Uint8Array(4);

  let textures = false; // the pictures are in
  let drawn = false; // a frame has been drawn: onReady has been told
  let going = false;
  let gone = false; // destroyed, or its context lost: it never draws again
  let frameId = 0;
  let last = -Infinity;

  /** Draws one frame at `seconds` (`life` 1: every effect, 0: the painting as it is) at the canvas's size now; false if it has none. */
  function draw(seconds, life) {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return false;
    // at the screen's pixels but never more than the picture's own for this half (it has no finer detail than that)
    const width = Math.max(1, Math.round(Math.min(Math.round(clientWidth * Math.min(win.devicePixelRatio || 1, MAX_DPR)), MAX_WIDTH) * LIFE_RES));
    const height = Math.max(1, Math.round(width * clientHeight / clientWidth));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    const [x, y, r] = hole();
    gl.uniform1f(uTime, seconds);
    gl.uniform1f(uLife, life);
    gl.uniform3f(uHole, x, y, r);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  function frame(now) {
    if (!going) return;
    frameId = win.requestAnimationFrame(frame);
    if (!textures || now - last < 1000 / LIFE_FPS - 2) return; // 30 a second: a frame that comes sooner than that waits for the next
    if (!draw(lifeClock(now - CLOCK_ZERO), 1)) return;
    last = now;
    if (!drawn) {
      drawn = true;
      onReady();
    }
  }

  function stop() {
    if (frameId) win.cancelAnimationFrame(frameId);
    frameId = 0;
    going = false;
  }

  const layer = {
    ready: () => textures && !gone,
    frame: draw,
    wait: () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel), // reading a pixel waits for the drawing
  };
  made.add(layer);

  /** The context is gone, or the pictures will not come: nothing more is drawn, and the page is told. */
  function lose() {
    if (gone) return;
    gone = true;
    stop();
    made.delete(layer);
    onLost();
  }
  canvas.addEventListener?.('webglcontextlost', lose);

  // The pictures. The painting cropped to this page's part, drawn through a 2D canvas; the mask from the two layers' alphas (water
  // in red, mist in green) in the same crop; the noise. Each is made once, here, and the images are let go once they are in. Each
  // step takes a tenth of a second or so, so they are done one to a turn of the page's event loop, and the page goes on drawing
  // (the book's pages turning) between them instead of standing still for half a second.
  const loadImage = src => new Promise((ok, bad) => {
    const image = new win.Image();
    image.onload = () => ok(image);
    image.onerror = () => bad(new Error(`${src} will not load`));
    image.src = src;
  });
  const cropped = image => {
    const [left, top, width, height] = crop;
    const surface = win.document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    const context = surface.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, left, top, width, height, 0, 0, width, height);
    return { surface, context };
  };
  const alphas = image => cropped(image).context.getImageData(0, 0, crop[2], crop[3]).data;
  const pause = () => new Promise(ok => setTimeout(ok, 0));
  (async () => {
    const [painting, water, mist] = await Promise.all([PAINTING_SRC, WATER_SRC, MIST_SRC].map(loadImage));
    const [, , width, height] = crop;
    let waters = null; // each layer's alpha, kept from one step to the next
    let mists = null;
    const steps = [
      () => {
        makeTexture(gl, 0, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cropped(painting).surface);
      },
      () => { waters = alphas(water); },
      () => { mists = alphas(mist); },
      () => {
        const mask = new Uint8Array(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          mask[i * 4] = waters[i * 4 + 3];
          mask[i * 4 + 1] = mists[i * 4 + 3];
          mask[i * 4 + 3] = 255;
        }
        makeTexture(gl, 1, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, mask);
      },
      () => {
        makeTexture(gl, 2, gl.REPEAT);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NOISE_SIZE, NOISE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseBytes ??= noiseData(NOISE_SIZE));
      },
    ];
    for (const step of steps) {
      await pause();
      if (gone) return; // let go while it waited
      step();
    }
    textures = true;
  })().catch(() => {
    lose();
    if (!gl.isContextLost?.()) loseContext(); // a picture that would not come: the context is of no use to anyone
  });

  return {
    start() {
      if (gone || going) return;
      going = true;
      last = -Infinity;
      frameId = win.requestAnimationFrame(frame);
    },
    stop,
    destroy() {
      stop();
      if (gone) return;
      gone = true;
      made.delete(layer);
      canvas.removeEventListener?.('webglcontextlost', lose); // losing the context on purpose is not a loss to tell of
      loseContext();
    },
    get running() {
      return going;
    },
  };
}

/**
 * What the life costs, for the lab: the average ms a frame takes to draw every live map now made (one draw of each, `frames` times),
 * waited for with a one-pixel read after every `every` frames (1: after each draw), once with the effects on (`life`) and once with
 * them off, just the painting (`plain`); `added` is the difference. Null when no layer is made with its pictures in and a size to
 * draw at. A browser pane that is not on screen (a hidden pane, a window nobody is watching) makes every read wait for its next 60 Hz
 * tick, 16.7 ms however little was drawn; `every` = `frames` waits once for them all, so that tick is shared by every frame.
 */
export function timeLiveMaps(frames = 30, every = 1) {
  const layers = [...made].filter(layer => layer.ready() && layer.frame(0, 1));
  if (!layers.length) return null;
  const time = life => {
    for (const layer of layers) {
      layer.frame(0, life);
      layer.wait();
    }
    const start = globalThis.performance.now();
    for (let i = 0; i < frames; i++) {
      for (const layer of layers) {
        layer.frame(i / LIFE_FPS, life);
        if ((i + 1) % every === 0 || i === frames - 1) layer.wait();
      }
    }
    return (globalThis.performance.now() - start) / frames;
  };
  const life = time(1);
  const plain = time(0);
  return { life, plain, added: life - plain };
}
