import * as THREE from 'three';
import { pickLook } from './looks.js';
import { seededRandom } from './random.js';
import { Handle } from './handle.js';

// The smiling sun (spec: "Brosandi sól") and the cloud shaped like Mosi (spec: "Ský"). Both are painted
// on small canvases at start-up and hang in the sky 600 m out, just beyond the sky dome, always in the same
// direction from the camera, as the sky itself is. Neither is fogged (at 600 m the height fog would erase
// them). The cloud is one camera-facing sprite; the sun is two draws: its face, a sprite whose frames are
// the eyes (open, half shut, shut), and over it one small mesh flat to the screen with its mouth and its two
// cartoon hands (the owner asked for them after the first test play, 2026-10-17).
//
// The sun has a personality: it blinks now and then by itself, its mouth smiles, grins or says "o", and its
// hands rest at the sides of the disc, wave hello or hug the sun itself, as a script asks (s.sun.wink, wave,
// hug and mouth in scene/scene.js).
//
// Everything that moves is a pure function of the game clock: main.js hands `update(t, camera)` the
// clock's time, so a pause holds the picture and a `?t=` capture lands on the same frame as playing. What a
// script asks for begins on the next update, at that update's time, and from there the picture at any time is
// worked out from the calls and the time alone, not from the frames in between. There is no canvas in Node:
// without a page the face and its sheet have no texture, and the tests hand in their own stand-ins.

const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const { lerp, clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const ORIGIN = new THREE.Vector3();
const smoother = s => s * s * s * (10 + s * (6 * s - 15)); // eased at both ends, with no speed and no acceleration there

export const SUN_DISTANCE = 600; // metres from the camera; engine/points.js uses it for the 'sun' point
export const WINK_SECONDS = 0.35;
// The wink passes through a half-shut face going down and coming back up (the owner asked for it: it reads softer), the way up a
// little slower, as a blink opens slower than it shuts (eyelids.js).
const HALF_DOWN = 0.06; // seconds of the half-shut face at the start of a wink
const HALF_UP = 0.09; // and at its end
// Idle blinks: quicker than the wink, through the same half-shut face, every 3 to 6 s on a seeded schedule of the clock's time.
// None begins during a wink or just after one.
export const BLINK_SECONDS = 0.2;
const BLINK_HALF_DOWN = 0.05;
const BLINK_HALF_UP = 0.07;
export const BLINK_EVERY = [3, 6]; // seconds from one blink to the next
const BLINK_CLEAR = 0.4; // seconds after a wink in which no blink begins
// The mouth: a smile, the default, a big grin or a surprised "o". Each change passes through a little open in-between mouth
// for a frame or two, so no shape pops into another.
export const MOUTHS = ['smile', 'grin', 'oh'];
export const MOUTH_SECONDS = 1.5; // how long mouth() holds a grin or an "o" before the smile comes back, unless it is told
export const MOUTH_BETWEEN = 0.08; // seconds of the in-between
// The hands: mittens in the face's gold and ink, each a square HAND_SIZE of the disc's radius across.
export const HAND_SIZE = 0.72;
export const WAVE_SECONDS = 2.3; // up beside the face, four swings, and down
export const HUG_SECONDS = 2.4; // in across the front, two squeezes, and out
export const CLOUD_OFFSET_DEG = 35; // the Mosi cloud hangs this far to the left of the sun, at its height
export const CLOUD_DRIFT_DEG_PER_MIN = 0.5; // and drifts to the right, toward the sun, as the sky's clouds do

// The sky shader (sky.js) paints its sun disc where dot(view, sunDir) climbs over 0.99935, fading in up to
// 0.9997: a disc 2.07 degrees in radius. The face is painted a little wider and covers it. A sprite is flat
// to the screen while the disc is round on the sphere, so toward the screen's edge the disc stretches more
// than the sprite does; the extra width keeps it covered out to about 35 degrees off the view axis.
export const SUN_RADIUS_DEG = 2.6;
const FRAMES = 3; // the face's strip: open eyes, half shut, shut
const FRAME_OF = { open: 0, half: 1, shut: 2 };
const FRAME = 256; // px a frame
const DISC_OF_FRAME = 0.9; // the painted disc's radius as a part of half a frame; the rest is clear margin
const R_PX = (FRAME / 2) * DISC_OF_FRAME; // the disc's radius in px: in the face's frames, and for the mouths on the sheet
// The sheet the overlay draws from: the mouths along the top, each the part of the face below its middle, painted at the face's
// own scale with the cell's top edge through the middle of the face; the hand below them, fingers up, its wrist near the bottom.
const SHEET = [512, 256]; // px
const MOUTH_CELL = [128, 96]; // px
const MOUTH_AT = { smile: 0, mid: 128, grin: 256, oh: 384 }; // each mouth's cell, from the left, on the top row
const HAND_CELL = [0, 112, 128]; // x, y and size in px
const HAND_PIVOT = [0.03, -0.28]; // the wrist, in the hand's square from its middle (x right, y up, a side being 1)
const CLOUD_WIDTH_DEG = 16;
const CLOUD_SIZE = [512, 256]; // px

/** '#rrggbb' as a canvas colour with an alpha. */
function rgba(hex, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** A disc ending at radius r, its edge soft over `feather` px. */
function softDisc(g, x, y, r, colour, alpha = 1, feather = 3) {
  const gradient = g.createRadialGradient(x, y, Math.max(0, r - feather), x, y, r);
  gradient.addColorStop(0, rgba(colour, alpha));
  gradient.addColorStop(1, rgba(colour, 0));
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

// ---------------------------------------------------------------------------------------------
// The face

const PAINT = { rim: '#f7bb3d', mid: '#ffdf78', core: '#fff3cd', ink: '#9b5424', cheek: '#f48a5c', glint: '#fff7de' };

/** One frame of the face without its mouth, in a square of FRAME px with the sun's centre in the middle; `eyes` is 'open', 'half' or 'shut'. */
function paintSun(g, eyes) {
  const c = FRAME / 2;
  const R = R_PX;

  const disc = g.createRadialGradient(c, c, 0, c, c, R + 2);
  disc.addColorStop(0, PAINT.core);
  disc.addColorStop(0.55, PAINT.mid);
  disc.addColorStop(0.93, PAINT.rim);
  disc.addColorStop(1, rgba(PAINT.rim, 0));
  g.fillStyle = disc;
  g.beginPath();
  g.arc(c, c, R + 2, 0, TAU);
  g.fill();

  for (const side of [-1, 1]) softDisc(g, c + side * 0.54 * R, c + 0.2 * R, 0.19 * R, PAINT.cheek, 0.4, 0.19 * R);

  g.lineCap = 'round';
  g.strokeStyle = PAINT.ink;
  for (const side of [-1, 1]) {
    const x = c + side * 0.33 * R;
    const y = c - 0.08 * R;
    if (eyes === 'shut') {
      // The content closed eye: a soft curve that sags in the middle (STYLE.md section 3), never a squint.
      g.lineWidth = 0.06 * R;
      g.beginPath();
      g.moveTo(x - 0.1 * R, y - 0.01 * R);
      g.quadraticCurveTo(x, y + 0.15 * R, x + 0.1 * R, y - 0.01 * R);
      g.stroke();
    } else if (eyes === 'half') {
      // On the way: the lower half of the open eye, under a lid that has come down to its middle, the lid's edge a soft line
      // that sags a little, as the shut eye's does. No glint: the lid has covered it.
      g.save();
      g.beginPath();
      g.rect(x - 0.2 * R, y + 0.01 * R, 0.4 * R, 0.3 * R);
      g.clip();
      g.fillStyle = PAINT.ink;
      g.beginPath();
      g.ellipse(x, y, 0.085 * R, 0.14 * R, 0, 0, TAU);
      g.fill();
      g.restore();
      g.lineWidth = 0.05 * R;
      g.beginPath();
      g.moveTo(x - 0.105 * R, y - 0.005 * R);
      g.quadraticCurveTo(x, y + 0.05 * R, x + 0.105 * R, y - 0.005 * R);
      g.stroke();
    } else {
      g.fillStyle = PAINT.ink;
      g.beginPath();
      g.ellipse(x, y, 0.085 * R, 0.14 * R, 0, 0, TAU);
      g.fill();
      softDisc(g, x + 0.03 * R, y - 0.06 * R, 0.04 * R, PAINT.glint, 0.95, 1);
    }
  }
}

/**
 * A mouth, with the face's centre at (c, cy) and its disc R px in radius: 'smile' (closed and kind, as the face always had),
 * 'mid' (a little open smile, the in-between), 'grin' (wide open, a tongue in the cheeks' colour) or 'oh' (a small round "o").
 */
function paintMouth(g, c, cy, R, shape) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = PAINT.ink;
  g.fillStyle = PAINT.ink;
  if (shape === 'smile') {
    g.lineWidth = 0.065 * R;
    g.beginPath();
    g.moveTo(c - 0.3 * R, cy + 0.3 * R);
    g.quadraticCurveTo(c, cy + 0.6 * R, c + 0.3 * R, cy + 0.3 * R);
    g.stroke();
    return;
  }
  if (shape === 'oh') {
    g.lineWidth = 0.05 * R;
    g.beginPath();
    g.ellipse(c, cy + 0.47 * R, 0.11 * R, 0.14 * R, 0, 0, TAU);
    g.fill();
    g.stroke();
    return;
  }
  // An open smile: a top edge that sags a little and a deep lower lip.
  const [half, top, sag, bottom, line] = shape === 'grin' ? [0.36, 0.25, 0.33, 0.9, 0.055] : [0.24, 0.31, 0.37, 0.66, 0.05];
  const outline = () => {
    g.beginPath();
    g.moveTo(c - half * R, cy + top * R);
    g.quadraticCurveTo(c, cy + sag * R, c + half * R, cy + top * R);
    g.quadraticCurveTo(c, cy + bottom * R, c - half * R, cy + top * R);
    g.closePath();
  };
  outline();
  g.fill();
  if (shape === 'grin') {
    g.save();
    outline();
    g.clip();
    softDisc(g, c, cy + 0.66 * R, 0.2 * R, PAINT.cheek, 1, 0.05 * R);
    g.restore();
  }
  g.strokeStyle = PAINT.ink;
  g.lineWidth = line * R;
  outline();
  g.stroke();
}

/**
 * The hand, fingers up, in a square of `size` px at (x, y): a mitten in the disc's gold with the ink of the face's strokes round
 * it (both shapes stroked twice as wide and filled over, so the outline goes round the thumb and the palm as one), two short
 * lines parting the fingers and a glint. The thumb is on the left: a right hand, palm out, as the screen-right hand is.
 */
function paintHand(g, x, y, size) {
  const S = size;
  const R = S / HAND_SIZE; // px to the disc's radius
  const line = 0.05 * R; // as heavy as the face's strokes
  const shapes = [[0.53, 0.5, 0.255, 0.3, 0], [0.255, 0.585, 0.085, 0.155, -0.55]]; // palm and thumb: centre, radii, turn
  const shape = ([cx, cy, rx, ry, turn]) => {
    g.beginPath();
    g.ellipse(x + cx * S, y + cy * S, rx * S, ry * S, turn, 0, TAU);
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = PAINT.ink;
  g.lineWidth = 2 * line;
  for (const s of shapes) { shape(s); g.stroke(); }
  const gold = g.createRadialGradient(x + 0.47 * S, y + 0.42 * S, 0, x + 0.5 * S, y + 0.5 * S, 0.36 * S);
  gold.addColorStop(0, PAINT.core);
  gold.addColorStop(0.45, PAINT.mid);
  gold.addColorStop(1, PAINT.rim);
  g.fillStyle = gold;
  for (const s of shapes) { shape(s); g.fill(); }
  g.strokeStyle = PAINT.ink;
  g.lineWidth = 0.6 * line;
  for (const fx of [0.45, 0.61]) {
    g.beginPath();
    g.moveTo(x + fx * S, y + 0.215 * S);
    g.lineTo(x + fx * S, y + 0.36 * S);
    g.stroke();
  }
  softDisc(g, x + 0.63 * S, y + 0.33 * S, 0.045 * S, PAINT.glint, 0.85, 1.5);
}

/** The face as a strip of frames, from the left: open eyes, half shut, shut. Null where there is no page. */
function drawSunFrames() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * FRAMES;
  canvas.height = FRAME;
  const g = canvas.getContext('2d');
  for (let frame = 0; frame < FRAMES; frame++) {
    g.save();
    g.translate(frame * FRAME, 0);
    paintSun(g, Object.keys(FRAME_OF)[frame]);
    g.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The overlay's sheet: the four mouths along the top, the hand below. Null where there is no page. */
function drawSunSheet() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = SHEET;
  const g = canvas.getContext('2d');
  for (const [shape, x] of Object.entries(MOUTH_AT)) paintMouth(g, x + MOUTH_CELL[0] / 2, 0, R_PX, shape);
  paintHand(g, ...HAND_CELL);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------------------------------------------------------------------------------------------
// What the face does, as functions of time. Poses are in the face's own units: x right and y up from its centre, in the disc's
// radius; a hand's angle is where its fingers point, in degrees clockwise from straight up. Side -1 is the hand on the screen's
// left (the sun's own right), side 1 the one on its right.

const REST = { x: 0.99, y: -0.42, angle: 128, bob: 3.1 }; // at the disc's sides, fingers out and down; a gentle bob of `bob` s
/** A hand at rest at time t, breathing a little. */
function restHand(side, t, out) {
  const phase = TAU * (t / REST.bob) + (side < 0 ? 1.3 : 0);
  out.x = side * REST.x;
  out.y = REST.y + 0.02 * Math.sin(phase);
  out.angle = side * (REST.angle + 4 * Math.sin(phase + 0.7));
  return out;
}
/** Where the hands are at rest at time t: [screen-left, screen-right], each { x, y, angle } (the calm between gestures). */
export function handsAtRest(t) {
  return [restHand(-1, t, {}), restHand(1, t, {})];
}
const mixPose = (a, b, k, out) => {
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.angle = lerp(a.angle, b.angle, k);
  return out;
};

// The wave: the screen-left hand (toward the middle of the frame in the dawn shot) rises beside the face, swings four times
// about the wrist, and comes back down. The swings grow in as the hand comes up and die away as it goes down, so nothing jerks.
const WAVE = { raise: 0.35, lower: 0.35, swings: 4, up: { x: -1.1, y: 0.3, angle: -14 }, swing: 26, grow: 0.3 };
const WAVE_RATE = WAVE.swings / (WAVE_SECONDS - WAVE.raise - WAVE.lower); // swings a second
function waveHand(u, rest, out) {
  const down = WAVE_SECONDS - WAVE.lower;
  if (u < WAVE.raise) mixPose(rest, WAVE.up, smoother(u / WAVE.raise), out);
  else if (u >= down) mixPose(WAVE.up, rest, smoother(clamp((u - down) / WAVE.lower, 0, 1)), out);
  else Object.assign(out, WAVE.up);
  const grown = smoother(clamp((u - WAVE.raise + WAVE.grow) / WAVE.grow, 0, 1)) * smoother(clamp((down + WAVE.grow - u) / WAVE.grow, 0, 1));
  const s = TAU * WAVE_RATE * (u - WAVE.raise);
  out.x -= 0.04 * grown * Math.sin(s); // the wrist goes a little with each swing
  out.y += 0.02 * grown * Math.sin(2 * s);
  out.angle -= WAVE.swing * grown * Math.sin(s);
  return out;
}

// The hug: both hands sweep down and in across the front of the disc, low, under the grin, and cross, each pointing up and out
// on the other side; there they squeeze twice, the face pressed a little wider and lower each time, and they sweep back out.
const HUG = { in: 0.45, out: 0.5, dip: 0.12, squeeze: 0.04, grin: [0.15, HUG_SECONDS - 0.1] };
// Where each hand ends up: 298 degrees is 62 degrees left of up, reached by turning clockwise, down and round, from the rest.
const crossed = side => ({ x: -side * 0.07, y: side < 0 ? -0.9 : -0.87, angle: side * 298 });
/** How hard the hug squeezes at u s into it, 0 to 1: two soft pulses while the hands are crossed. */
function squeezeOf(u) {
  const hold = HUG_SECONDS - HUG.in - HUG.out;
  if (u <= HUG.in || u >= HUG.in + hold) return 0;
  return Math.sin((TAU * (u - HUG.in)) / hold) ** 2;
}
function hugHand(side, u, rest, out) {
  const goal = crossed(side);
  if (u < HUG.in || u >= HUG_SECONDS - HUG.out) {
    const k = u < HUG.in ? smoother(u / HUG.in) : 1 - smoother(clamp((u - (HUG_SECONDS - HUG.out)) / HUG.out, 0, 1));
    mixPose(rest, goal, k, out);
    out.y -= HUG.dip * Math.sin(Math.PI * k); // down under on the way in and out
    return out;
  }
  const p = squeezeOf(u);
  out.x = goal.x * (1 - 0.6 * p); // pressed together
  out.y = goal.y + 0.03 * p;
  out.angle = goal.angle + side * 8 * p;
  return out;
}

/** The blinks' start times on the clock: seeded, so the same every time, and worked out as far as asked for. */
function blinkSchedule(seed = 'sun') {
  const random = seededRandom(seed);
  const gap = () => BLINK_EVERY[0] + (BLINK_EVERY[1] - BLINK_EVERY[0]) * random();
  const starts = [gap()];
  /** The latest start at or before t, or -Infinity. */
  return t => {
    while (starts.at(-1) <= t) starts.push(starts.at(-1) + gap());
    if (starts[0] > t) return -Infinity;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return starts[lo];
  };
}

/**
 * The sun's face: a sprite along `lighting.direction`, 600 m from the camera, over the sky's own sun disc, and the overlay with its
 * mouth and hands.
 *   sprite       the face, a THREE.Sprite in `scene`
 *   overlay      the mouth and the two hands, one THREE.Mesh of three quads flat to the screen, drawn over the face
 *   wink()       shuts the eyes for 0.35 s of game time, counted from the next update: half shut, shut, half shut
 *   wave()       the screen-left hand rises, waves four times and comes down (WAVE_SECONDS)
 *   hug()        both hands cross over the front of the disc and squeeze twice, the face grinning (HUG_SECONDS)
 *   mouth(shape, seconds = MOUTH_SECONDS)  'grin' or 'oh' for that long, then the smile again; 'smile' at once
 *     wave, hug and mouth each return a Handle, done when the gesture is over or the smile is back (a mouth that a later
 *     mouth call cuts short ends cancelled). A gesture asked for while another goes on begins when that one is over; a mouth
 *     asked while a hug waits its turn leaves the hug its grin. Cancelling a handle (a script's race lost, a scene stopped):
 *     a call that has not begun, or a gesture still waiting its turn, is dropped and the gestures queued behind it move up; a
 *     gesture under way finishes; a mouth under way goes back to the smile at once, through the in-between.
 *   update(t, camera)  t is the game clock in seconds; call it after the camera has moved
 *   eyes         'open', 'half' or 'shut': which frame of the face shows (a wink or a blink)
 *   eyesClosed   whether a wink or a blink shows
 *   mouthFrame   the mouth showing: 'smile', 'mid' (the in-between), 'grin' or 'oh'
 *   hands        [screen-left, screen-right], each { x, y, angle }: the wrist in the disc's radius from its centre, and degrees
 *   handPoints   the middle of each hand in the world, in the same order
 *   squash       { x, y }: how the hug presses the face, 1 at rest
 *   radiusDeg    the painted disc's angular radius at rest, as seen from the camera
 * `texture` is the strip of FRAMES frames and `sheet` the overlay's; the page paints them, a test can pass its own (or null).
 */
export function createSunFace({ scene, lighting, texture = drawSunFrames(), sheet = drawSunSheet() }) {
  const direction = lighting.direction.clone().normalize();
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'SunFace';
  sprite.renderOrder = -2; // the farthest thing there is: before everything else that blends
  const size = (2 * SUN_DISTANCE * Math.tan(rad(SUN_RADIUS_DEG))) / DISC_OF_FRAME;
  sprite.scale.setScalar(size);
  scene.add(sprite);
  texture?.repeat.set(1 / FRAMES, 1);

  // The overlay: three quads, the mouth and then the hands, so the hands cross over the mouth's part of the face. Their corners are
  // worked out on the CPU each update, along the camera's own right and up as the sprite's are, around the face's centre.
  const R = SUN_DISTANCE * Math.tan(rad(SUN_RADIUS_DEG)); // the disc's radius in metres
  const geometry = new THREE.BufferGeometry();
  const corners = new THREE.BufferAttribute(new Float32Array(12 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const uvs = new THREE.BufferAttribute(new Float32Array(12 * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', corners);
  geometry.setAttribute('uv', uvs);
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.4 * R); // wherever the hands go
  const overlay = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: sheet, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }));
  overlay.name = 'SunHandsAndMouth';
  overlay.renderOrder = -1.5; // over the face, under the cloud
  scene.add(overlay);
  // A rectangle of the sheet, in px from its top left, as the uvs of a quad's corners (bottom left, bottom right, top right, top
  // left); `mirror` flips it left to right (the screen-left hand is the right one mirrored).
  const setCell = (quad, [x, y, w, h], mirror = false) => {
    const [u0, u1] = mirror ? [(x + w) / SHEET[0], x / SHEET[0]] : [x / SHEET[0], (x + w) / SHEET[0]];
    const top = 1 - y / SHEET[1];
    const bottom = 1 - (y + h) / SHEET[1];
    [[u0, bottom], [u1, bottom], [u1, top], [u0, top]].forEach(([u, v], k) => uvs.setXY(quad * 4 + k, u, v));
    uvs.needsUpdate = true;
  };
  const handCell = [HAND_CELL[0], HAND_CELL[1], HAND_CELL[2], HAND_CELL[2]];
  setCell(1, handCell, true);
  setCell(2, handCell);

  const hang = origin => {
    sprite.position.copy(origin).addScaledVector(direction, SUN_DISTANCE);
    overlay.position.copy(sprite.position);
  };
  hang(ORIGIN); // until the first update, as seen from the world's origin: never a giant face on the camera

  // What scripts have asked for. Calls wait for the next update and begin at its time (`asked`).
  const pending = [];
  let winkStart = -Infinity;
  const gestures = []; // { kind, asked, start, end, handle }, in order, never overlapping
  // The mouth: the mouth() calls that have begun (and the smile a cancelled one asks for), each tagged with when it began, `from`.
  // What the mouth shows is worked out from them and the hugs' grins by replanMouth: each plan takes over from where it begins.
  const mouthCalls = []; // { from, shape, seconds }
  const mouthHandles = new Map(); // a mouth() call's handle while it is under way -> { call, doneAt }
  let changes = []; // { at, shape }, in order
  const blinkBefore = blinkSchedule();
  let lastT = -Infinity;
  let shownMouth = null;

  const state = {
    eyes: 'open', mouth: 'smile', squash: { x: 1, y: 1 },
    hands: [{ x: 0, y: 0, angle: 0 }, { x: 0, y: 0, angle: 0 }],
    points: [new THREE.Vector3(), new THREE.Vector3()],
  };
  const rest = [{ x: 0, y: 0, angle: 0 }, { x: 0, y: 0, angle: 0 }];

  function eyesAt(t) {
    const into = t - winkStart;
    if (into >= 0 && into < WINK_SECONDS) return into < HALF_DOWN || into >= WINK_SECONDS - HALF_UP ? 'half' : 'shut';
    const start = blinkBefore(t);
    const blink = t - start;
    if (!(blink < BLINK_SECONDS)) return 'open';
    if (start >= winkStart && start < winkStart + WINK_SECONDS + BLINK_CLEAR) return 'open'; // no blink in a wink, or just after
    return blink < BLINK_HALF_DOWN || blink >= BLINK_SECONDS - BLINK_HALF_UP ? 'half' : 'shut';
  }

  function mouthAt(t) {
    let i = changes.length - 1;
    while (i >= 0 && changes[i].at > t) i--;
    if (i < 0) return 'smile';
    const before = i > 0 ? changes[i - 1].shape : 'smile';
    return changes[i].shape !== before && t - changes[i].at < MOUTH_BETWEEN ? 'mid' : changes[i].shape;
  }

  /**
   * The mouth's changes, from every plan in the order the plans begin: a mouth() call where it began, a hug's grin where the hug
   * grins (so a mouth asked while a hug waits its turn does not take the hug's grin away, and a grin moves with its hug). Each plan
   * takes over from its beginning on: what an earlier one had planned from there is dropped.
   */
  function replanMouth() {
    const plans = mouthCalls.map((m, order) => ({
      at: m.from, order, steps: m.shape === 'smile' ? [[m.from, 'smile']] : [[m.from, m.shape], [m.from + m.seconds, 'smile']],
    }));
    gestures.forEach((g, i) => {
      if (g.kind !== 'hug') return;
      const at = g.start + HUG.grin[0];
      plans.push({ at, order: mouthCalls.length + i, steps: [[at, 'grin'], [g.start + HUG.grin[1], 'smile']] });
    });
    plans.sort((a, b) => a.at - b.at || a.order - b.order);
    changes = [];
    for (const plan of plans) {
      while (changes.length && changes.at(-1).at >= plan.at) changes.pop();
      for (const [at, shape] of plan.steps) changes.push({ at, shape });
    }
  }

  /** The gestures not begun by `now` start as early as the queue lets them: when the one before ends, never before they were asked. */
  function repack(now) {
    let end = -Infinity;
    for (const g of gestures) {
      if (g.start > now) {
        const length = g.end - g.start;
        g.start = Math.max(g.asked, end);
        g.end = g.start + length;
      }
      end = g.end;
    }
  }

  function begin(call, t) {
    if (call.kind === 'wink') {
      winkStart = t;
    } else if (call.kind === 'mouth' || call.kind === 'smile') {
      // A newer mouth cuts the one under way short (out of the map first, so its cancel asks for no smile of its own). The smile
      // a cancelled mouth asked for has no handle.
      if (call.kind === 'mouth') {
        for (const h of [...mouthHandles.keys()]) {
          mouthHandles.delete(h);
          h.cancel();
        }
      }
      const was = mouthAt(t);
      const record = { from: t, shape: call.kind === 'smile' ? 'smile' : call.shape, seconds: call.seconds ?? 0 };
      mouthCalls.push(record);
      replanMouth();
      if (call.handle) {
        // Done once the smile is back: at once for a smile that was there already, else after the in-between.
        const doneAt = record.shape === 'smile' ? (was === 'smile' ? t : t + MOUTH_BETWEEN) : t + record.seconds + MOUTH_BETWEEN;
        mouthHandles.set(call.handle, { call: record, doneAt });
      }
    } else {
      // A gesture begins now, or when the ones under way or waiting are over.
      const last = gestures.at(-1);
      const start = last && last.end > t ? last.end : t;
      const length = call.kind === 'wave' ? WAVE_SECONDS : HUG_SECONDS;
      gestures.push({ kind: call.kind, asked: t, start, end: start + length, handle: call.handle });
      if (call.kind === 'hug') replanMouth();
    }
  }

  /**
   * A handle cancelled (a script's race lost, a scene stopped): a call still waiting for the next update is dropped; a gesture not
   * begun yet is dropped and those queued behind it move up; a gesture under way finishes; a mouth under way goes back to the smile
   * at the next update, through the in-between.
   */
  function cancelled(handle) {
    const waiting = pending.findIndex(call => call.handle === handle);
    if (waiting >= 0) {
      pending.splice(waiting, 1);
      return;
    }
    if (mouthHandles.delete(handle)) {
      pending.push({ kind: 'smile' });
      return;
    }
    const i = gestures.findIndex(g => g.handle === handle);
    if (i >= 0 && gestures[i].start > lastT) {
      gestures.splice(i, 1);
      repack(lastT);
      replanMouth();
    }
  }

  /** Forget what began after t: the clock went back, a seek that starts over, and the script will ask again. */
  function rewind(t) {
    if (winkStart > t) winkStart = -Infinity;
    while (gestures.length && gestures.at(-1).asked > t) gestures.pop().handle.cancel();
    while (mouthCalls.length && mouthCalls.at(-1).from > t) mouthCalls.pop();
    for (const [h, m] of [...mouthHandles]) {
      if (m.call.from <= t) continue;
      mouthHandles.delete(h);
      h.cancel();
    }
    replanMouth();
  }

  function handsAt(t) {
    restHand(-1, t, rest[0]);
    restHand(1, t, rest[1]);
    const g = gestures.find(x => x.start <= t && t < x.end);
    const [left, right] = state.hands;
    state.squash.x = 1;
    state.squash.y = 1;
    if (g?.kind === 'wave') {
      waveHand(t - g.start, rest[0], left);
      Object.assign(right, rest[1]);
    } else if (g?.kind === 'hug') {
      hugHand(-1, t - g.start, rest[0], left);
      hugHand(1, t - g.start, rest[1], right);
      const p = squeezeOf(t - g.start);
      state.squash.x = 1 + HUG.squeeze * p;
      state.squash.y = 1 - HUG.squeeze * p;
    } else {
      Object.assign(left, rest[0]);
      Object.assign(right, rest[1]);
    }
  }

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const put = (i, x, y) => corners.setXYZ(i, (right.x * x + up.x * y) * R, (right.y * x + up.y * y) * R, (right.z * x + up.z * y) * R);
  const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

  /** The overlay's corners along the camera's right and up, around the face's centre, and where the hands are in the world. */
  function lay(camera) {
    camera.getWorldQuaternion(turn);
    right.set(1, 0, 0).applyQuaternion(turn);
    up.set(0, 1, 0).applyQuaternion(turn);
    // The mouth, on the face and pressed with it: its cell's top edge through the face's middle.
    const w = (MOUTH_CELL[0] / R_PX / 2) * state.squash.x;
    const h = (MOUTH_CELL[1] / R_PX) * state.squash.y;
    put(0, -w, -h);
    put(1, w, -h);
    put(2, w, 0);
    put(3, -w, 0);
    // The hands: each square turned about its wrist.
    state.hands.forEach((hand, k) => {
      const px = (k === 0 ? -1 : 1) * HAND_PIVOT[0];
      const a = rad(hand.angle);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const ax = (cx, cy) => hand.x + (cx - px) * HAND_SIZE * cos + (cy - HAND_PIVOT[1]) * HAND_SIZE * sin;
      const ay = (cx, cy) => hand.y - (cx - px) * HAND_SIZE * sin + (cy - HAND_PIVOT[1]) * HAND_SIZE * cos;
      CORNERS.forEach(([cx, cy], i) => put(4 + 4 * k + i, ax(cx, cy), ay(cx, cy)));
      state.points[k].copy(sprite.position).addScaledVector(right, ax(0, 0) * R).addScaledVector(up, ay(0, 0) * R);
    });
    corners.needsUpdate = true;
    overlay.updateMatrixWorld();
  }

  const ask = (kind, extra = {}) => {
    const handle = new Handle(`sun ${kind}`, () => cancelled(handle));
    pending.push({ kind, handle, ...extra });
    return handle;
  };

  return {
    sprite,
    overlay,
    wink() { pending.push({ kind: 'wink' }); },
    wave() { return ask('wave'); },
    hug() { return ask('hug'); },
    mouth(shape, seconds = MOUTH_SECONDS) {
      if (!MOUTHS.includes(shape)) throw new TypeError(`the sun's mouth is 'smile', 'grin' or 'oh', not ${JSON.stringify(shape)}`);
      if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError(`the sun's mouth holds for a number of seconds of 0 or more, not ${seconds}`);
      return ask('mouth', { shape, seconds });
    },
    update(t, camera) {
      hang(camera.position);
      if (t < lastT - 1e-9) rewind(t);
      lastT = t;
      for (const call of pending.splice(0)) begin(call, t);
      state.eyes = eyesAt(t);
      if (texture) texture.offset.x = FRAME_OF[state.eyes] / FRAMES;
      state.mouth = mouthAt(t);
      if (state.mouth !== shownMouth) {
        setCell(0, [MOUTH_AT[state.mouth], 0, ...MOUTH_CELL]);
        shownMouth = state.mouth;
      }
      handsAt(t);
      sprite.scale.set(size * state.squash.x, size * state.squash.y, 1);
      lay(camera);
      for (const g of gestures) if (g.end <= t && !g.handle.done) g.handle.finish();
      for (const [h, m] of [...mouthHandles]) {
        if (m.doneAt > t) continue;
        mouthHandles.delete(h);
        h.finish();
      }
    },
    get eyes() { return state.eyes; },
    get eyesClosed() { return state.eyes !== 'open'; },
    get mouthFrame() { return state.mouth; },
    get hands() { return state.hands; },
    get handPoints() { return state.points; },
    get squash() { return state.squash; },
    get radiusDeg() { return deg(Math.atan(((size / 2) * DISC_OF_FRAME) / SUN_DISTANCE)); },
  };
}

// ---------------------------------------------------------------------------------------------
// The cloud

// Mosi in profile facing right, in the canvas's own pixels (y down, ground at about 224): a barrel body,
// four stout legs, a tail that thins away, a low head with a beak, the big frill behind it and the horns
// forward. Each part is a tapered capsule [x0, y0, r0, x1, y1, r1], drawn back to front.
const MOSI = {
  farLegs: [[270, 174, 29, 268, 220, 25], [190, 176, 30, 192, 220, 26]],
  tail: [[122, 126, 38, 82, 134, 20], [82, 134, 20, 40, 148, 5]],
  body: [[172, 132, 58, 278, 128, 56]],
  nearLegs: [[324, 174, 31, 326, 222, 26], [136, 176, 32, 132, 222, 27]],
  frill: [[354, 82, 56, 354, 82, 56]],
  head: [[398, 144, 44, 440, 160, 29], [440, 160, 29, 462, 169, 14]],
  horns: [[430, 122, 17, 500, 78, 6], [414, 110, 17, 486, 66, 6], [452, 152, 12, 472, 126, 6]],
};

/** The tapered capsule round two circles as the current path: a leg, a horn, a tail. */
function capsule(g, [x0, y0, r0, x1, y1, r1]) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  g.beginPath();
  if (d <= Math.abs(r0 - r1)) {
    g.arc(...(r0 > r1 ? [x0, y0, r0] : [x1, y1, r1]), 0, TAU);
    return;
  }
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const spread = Math.acos((r0 - r1) / d);
  g.arc(x0, y0, r0, angle + spread, angle - spread + TAU);
  g.arc(x1, y1, r1, angle - spread, angle + spread);
  g.closePath();
}

/** Cloud billows [x, y, r] on top of the body and round the frill's rim, seeded so the cloud never changes. */
function mosiBillows() {
  const random = seededRandom('mosi-cloud');
  const billows = [];
  const [[x0, y0, r0, x1, y1, r1]] = MOSI.body;
  for (let x = x0 - r0 * 0.75; x < x1 + r1 * 0.5; x += 30 + random() * 12) {
    const k = clamp((x - x0) / (x1 - x0), 0, 1);
    const top = lerp(y0, y1, k) - Math.sqrt(Math.max(0, lerp(r0, r1, k) ** 2 - (x - lerp(x0, x1, k)) ** 2));
    billows.push([x, top + 6, 20 + random() * 11]);
  }
  const [[x, y, r]] = MOSI.frill;
  for (let a = -3.4; a < -0.3; a += 0.29) {
    billows.push([x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), 11 + random() * 4]);
  }
  return billows;
}

/** The cloud on a canvas in the sky's colours: the shade colour underneath, the cloud colour on top. */
function drawMosiCloud(look) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = CLOUD_SIZE;
  const g = canvas.getContext('2d');
  const billows = mosiBillows();
  const parts = [...MOSI.farLegs, ...MOSI.tail, ...MOSI.body, ...MOSI.nearLegs, ...MOSI.frill, ...MOSI.head, ...MOSI.horns];
  // Twice: all in the shade colour, then all again, a little higher, in the cloud colour, so the shade stays
  // along the underside of everything. The soft shadow feathers every edge.
  for (const [colour, lift] of [[look.sky.cloudShade, 0], [look.sky.cloud, 9]]) {
    g.save();
    g.translate(0, -lift);
    g.fillStyle = colour;
    g.shadowColor = rgba(colour, 0.9);
    g.shadowBlur = 7;
    for (const part of parts) {
      capsule(g, part);
      g.fill();
    }
    for (const [x, y, r] of billows) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  // And a wash of the shade colour toward the belly, over what is drawn and nowhere else.
  const wash = g.createLinearGradient(0, 100, 0, 232);
  wash.addColorStop(0, rgba(look.sky.cloudShade, 0));
  wash.addColorStop(1, rgba(look.sky.cloudShade, 0.6));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = wash;
  g.fillRect(0, 0, ...CLOUD_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * One cloud in the shape of Mosi (the child can spot it), `CLOUD_OFFSET_DEG` to the left of the sun at its
 * height, drifting right at `CLOUD_DRIFT_DEG_PER_MIN`. `look` gives the sky's cloud colours.
 *   sprite       the THREE.Sprite, in `scene`
 *   update(t, camera)  t is the game clock in seconds; call it after the camera has moved
 */
export function addMosiCloud({ scene, lighting, look = pickLook('morning'), texture = drawMosiCloud(look) }) {
  const sun = lighting.direction.clone().normalize();
  const azimuth = Math.atan2(sun.z, sun.x); // from +X toward +Z, which is to the right of anyone facing the sun
  const elevation = Math.asin(sun.y);
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, opacity: 0.92, depthWrite: false, fog: false, toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'MosiCloud';
  sprite.renderOrder = -1; // in front of the sun, should it ever drift over it
  const width = 2 * SUN_DISTANCE * Math.tan(rad(CLOUD_WIDTH_DEG / 2));
  sprite.scale.set(width, (width * CLOUD_SIZE[1]) / CLOUD_SIZE[0], 1);
  scene.add(sprite);

  const direction = new THREE.Vector3();
  function hang(t, origin) {
    const a = azimuth - rad(CLOUD_OFFSET_DEG) + rad(CLOUD_DRIFT_DEG_PER_MIN) * (t / 60);
    const c = Math.cos(elevation);
    direction.set(c * Math.cos(a), Math.sin(elevation), c * Math.sin(a));
    sprite.position.copy(origin).addScaledVector(direction, SUN_DISTANCE);
  }
  hang(0, ORIGIN); // until the first update, as seen from the world's origin

  return {
    sprite,
    update(t, camera) { hang(t, camera.position); },
  };
}
