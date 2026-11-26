import * as THREE from 'three';
import { seededRandom } from './random.js';
import { SUN_DISTANCE, farPlaneDepth } from './sun-face.js';

// The festival's half moon (spec 7: "Tunglið er hálft tungl með persónuleika, gert á sama hátt og sólin"): painted on small canvases
// at start-up exactly as engine/sun-face.js paints the sun, and hung on the sky SUN_DISTANCE from the camera, always in the same
// direction from it, as the sun is. It is two draws: its face, a sprite whose frames are its one eye (open, half shut, shut), and
// over it one small mesh flat to the screen with its mouth, its party blower, its party hat and its one small hand. Neither is
// fogged; both are drawn at the far plane's depth (farPlaneDepth), so the stage and the heaps of the sea of cloud in front hide it.
//
// The moon is a half moon in profile, looking to the screen's left: the lit half of a disc, its straight side the face's profile
// (forehead, nose, lips, chin), in the sun's palette's kin: pale cream for the sun's gold, the very same ink, a cool cheek.
//
// Everything is a number to show (the same pose is the same picture), and moonPose(acts, time) works the pose out from what the
// festival asks of it and the clock alone: the moon peeks up over the sea of cloud, blinks by itself, smiles, toots its blower,
// gets its hat knocked askew by the roar and puts it right with its hand, rocks on the beat holding its hat, says "o", waves, and
// lifts its hat to say goodbye. Its place is the caller's (hatid-route.js SKY.moon): an engine file never imports a chapter's.

const rad = THREE.MathUtils.degToRad;
const { lerp, clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const smoother = s => s * s * s * (10 + s * (6 * s - 15)); // eased at both ends (as sun-face.js)

/**
 * radiusDeg: the disc's angular radius (the half moon is half of it); under: degrees of elevation its middle is at with rise 0, under
 * the sea of cloud's horizon, hat and all; hat and hand: the party hat's and the hand's squares, in the disc's radius.
 */
export const MOON = { radiusDeg: 3.4, under: -6, hat: 0.9, hand: 0.6 };
export const MOON_MOUTHS = ['smile', 'grin', 'oh', 'blow'];
/** The acts' lengths in seconds. */
export const MOON_ACTS = { peek: 3, toot: 2, fixHat: 1.6, wave: 2.3, tipHat: 2 };
export const MOON_ROCK_DEG = 8; // how far it rocks either way on a beat
export const MOON_ASKEW_DEG = 25; // how far the roar knocks its hat: forward, over its brow (a pose's `hat` is degrees knocked forward)
export const MOON_BLINK = { seconds: 0.2, every: [3, 6] }; // idle blinks, as the sun's: through half shut, every 3 to 6 s
export const MOON_MOUTH_SECONDS = 1.5; // a smile or an "o" holds this long unless the act says
export const MOON_BETWEEN = 0.08; // seconds of the little open in-between mouth when the mouth changes ('mid')
/** The overlay's quads in drawing order: the mouth, the blower's tube, its curl, the hat, the hand (over the hat it holds). */
export const MOON_QUADS = { mouth: 0, tube: 1, curl: 2, hat: 3, hand: 4 };
const KINDS = ['peek', 'smile', 'toot', 'askew', 'fixHat', 'oh', 'wave', 'tipHat', 'rock'];

// ---------------------------------------------------------------------------------------------
// The painting. Places are in the disc's radius from its middle, x right, y up ("local"); on a canvas they are R_PX px a radius.

const FRAMES = 3;
const FRAME_OF = { open: 0, half: 1, shut: 2 };
const FRAME = 256; // px a frame
const DISC_OF_FRAME = 0.9; // the disc's radius as a part of half a frame, as the sun's
const R_PX = (FRAME / 2) * DISC_OF_FRAME;
const SHEET = [512, 256];
// Cells on the sheet, in px from its top left. The mouths along the top, each a square painted at the face's own scale round
// MOUTH_AT; under them the hat, the hand, the blower's tube (its mouth end on the right) and its curl.
const MOUTH_PX = 96;
const MOUTH_CELLS = { smile: 0, mid: 96, grin: 192, oh: 288, blow: 384 };
const MOUTH_AT = [-0.12, -0.3];
const HAT_PX = Math.round(MOON.hat * R_PX);
const HAT_CELL = [0, 104, HAT_PX, HAT_PX];
const HAND_PX = Math.round(MOON.hand * R_PX);
const HAND_CELL = [112, 104, HAND_PX, HAND_PX];
const TUBE_CELL = [192, 104, 112, 24];
const CURL_CELL = [320, 104, 56, 56];

// Where things are on the face (local)
const EYE_AT = [0.1, 0.33];
const MOUTH_POINT = [-0.2, -0.3]; // the lips, at the profile's edge
const LIPS = [-0.36, -0.31]; // where the blower leaves the pursed lips
const BLOW_DIR = rad(8); // the blower points left and this far down
const TUBE = { length: TUBE_CELL[2] / R_PX, width: TUBE_CELL[3] / R_PX };
const CURL = { rolled: 0.46, out: 0.2 }; // the curl's square, rolled up and at the end of the blown-out tube
// The hat: its square's brim point (the middle of its base, as a part of the square from its top left) sits at HAT_AT, leaning
// HAT_TILT degrees (clockwise; less than 0 leans it forward, over the forehead); its pom-pom's top HAT_TOP of the square over it.
const HAT_PIVOT = [0.5, 0.86];
const HAT_AT = [0.08, 0.86];
const HAT_TILT = -12;
const HAT_TOP = 0.8;
const HAT_GRIP = [0.74, 0.6]; // where the hand holds it, in the square
const TIP = { lift: 0.42, tilt: 10 }; // the goodbye: the hat up off the head this far (radii) and turned this much more
// The hand (one small mitten, as the sun's): its wrist (x, y) and the way its fingers point (degrees clockwise from up)
const HAND_PIVOT = [0.03, -0.28]; // the wrist in the hand's square from its middle (x right, y up, a side being 1), as the sun's
const HAND_REST = { x: 0.97, y: -0.44, angle: 130 }; // at its round back, low, fingers out and down
const WAVE = { raise: 0.35, lower: 0.35, swings: 4, up: { x: 1.1, y: 0.3, angle: 14 }, swing: 26, grow: 0.3 };

const PAINT = { rim: '#d9cc9a', mid: '#f3ecc8', core: '#fffbe9', ink: '#9b5424', cheek: '#9ab0ec', glint: '#fff7de', crater: '#cdbd86' };
const HAT_PAINT = { cloth: '#ff86bd', deep: '#e0558f', stripe: '#ffd85c', dot: '#8fd8ff', brim: '#fff7de' };

/** '#rrggbb' as a canvas colour with an alpha. */
function rgba(hex, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
/** A disc ending at radius r, its edge soft over `feather` px (sun-face.js's). */
function softDisc(g, x, y, r, colour, alpha = 1, feather = 3) {
  const gradient = g.createRadialGradient(x, y, Math.max(0, r - feather), x, y, r);
  gradient.addColorStop(0, rgba(colour, alpha));
  gradient.addColorStop(1, rgba(colour, 0));
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}
/** A local place as canvas px, with the disc's middle at (cx, cy) and `at` (local) drawn there instead of the middle. */
const mapper = (cx, cy, at = [0, 0]) => (x, y) => [cx + (x - at[0]) * R_PX, cy - (y - at[1]) * R_PX];

/** The half moon's outline as the current path: the profile down its straight side, then round its lit back. */
function moonPath(g, P) {
  g.beginPath();
  g.moveTo(...P(-0.06, 0.998));
  g.bezierCurveTo(...P(-0.15, 0.92), ...P(-0.23, 0.72), ...P(-0.2, 0.54)); // the forehead
  g.quadraticCurveTo(...P(-0.15, 0.44), ...P(-0.17, 0.33)); // the brow, in at the eye
  g.bezierCurveTo(...P(-0.2, 0.25), ...P(-0.45, 0.18), ...P(-0.43, 0.07)); // the nose
  g.quadraticCurveTo(...P(-0.41, -0.02), ...P(-0.21, -0.04)); // under it
  g.quadraticCurveTo(...P(-0.25, -0.13), ...P(-0.21, -0.23)); // the upper lip
  g.quadraticCurveTo(...P(-0.16, -0.29), ...P(-0.21, -0.35)); // the mouth's corner
  g.quadraticCurveTo(...P(-0.26, -0.43), ...P(-0.18, -0.49)); // the lower lip
  g.bezierCurveTo(...P(-0.13, -0.54), ...P(-0.31, -0.62), ...P(-0.23, -0.77)); // the chin
  g.quadraticCurveTo(...P(-0.15, -0.93), ...P(-0.04, -0.999));
  const [cx, cy] = P(0, 0);
  g.arc(cx, cy, R_PX, Math.atan2(0.999, -0.04), Math.atan2(-0.998, -0.06), true); // round the back, through its right
  g.closePath();
}

/** One frame of the face without its mouth, in a square of FRAME px, the disc's middle in its middle; `eye` 'open', 'half', 'shut'. */
function paintMoon(g, eye) {
  const P = mapper(FRAME / 2, FRAME / 2);
  const R = R_PX;
  // the half moon, lit a little from its back, with a soft glow round it
  g.save();
  g.shadowColor = rgba(PAINT.core, 0.55);
  g.shadowBlur = 0.09 * R;
  const fill = g.createRadialGradient(...P(0.3, 0.25), 0, ...P(0.1, 0), 1.05 * R);
  fill.addColorStop(0, PAINT.core);
  fill.addColorStop(0.55, PAINT.mid);
  fill.addColorStop(0.95, PAINT.rim);
  fill.addColorStop(1, PAINT.rim);
  g.fillStyle = fill;
  moonPath(g, P);
  g.fill();
  g.restore();
  // a few soft craters and the cool cheek, kept inside it
  g.save();
  moonPath(g, P);
  g.clip();
  for (const [x, y, r] of [[0.56, 0.4, 0.13], [0.66, -0.36, 0.1], [0.36, -0.68, 0.07], [0.82, 0.06, 0.06], [0.4, 0.72, 0.06]]) {
    softDisc(g, ...P(x, y), r * R, PAINT.crater, 0.42, 0.6 * r * R);
  }
  softDisc(g, ...P(0.1, -0.13), 0.15 * R, PAINT.cheek, 0.45, 0.15 * R);
  g.restore();
  g.lineJoin = 'round';
  g.strokeStyle = rgba(PAINT.rim, 0.9);
  g.lineWidth = 0.025 * R;
  moonPath(g, P);
  g.stroke();
  // the eye, as the sun's eyes are painted
  g.lineCap = 'round';
  g.strokeStyle = PAINT.ink;
  const [x, y] = P(...EYE_AT);
  if (eye === 'shut') {
    g.lineWidth = 0.06 * R;
    g.beginPath();
    g.moveTo(x - 0.1 * R, y - 0.01 * R);
    g.quadraticCurveTo(x, y + 0.15 * R, x + 0.1 * R, y - 0.01 * R);
    g.stroke();
  } else if (eye === 'half') {
    g.save();
    g.beginPath();
    g.rect(x - 0.2 * R, y + 0.01 * R, 0.4 * R, 0.3 * R);
    g.clip();
    g.fillStyle = PAINT.ink;
    g.beginPath();
    g.ellipse(x, y, 0.085 * R, 0.135 * R, 0, 0, TAU);
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
    g.ellipse(x, y, 0.085 * R, 0.135 * R, 0, 0, TAU);
    g.fill();
    softDisc(g, x - 0.03 * R, y - 0.055 * R, 0.04 * R, PAINT.glint, 0.95, 1); // the glint toward where it looks
  }
}

/** A mouth in profile at the lips, local places through P: 'smile', 'mid' (the in-between), 'grin', 'oh' or 'blow' (pursed). */
function paintMouth(g, P, shape) {
  const R = R_PX;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = PAINT.ink;
  g.fillStyle = PAINT.ink;
  const path = points => {
    g.beginPath();
    g.moveTo(...P(...points[0]));
    for (let i = 1; i < points.length; i += 2) g.quadraticCurveTo(...P(...points[i]), ...P(...points[i + 1]));
    g.closePath();
  };
  if (shape === 'smile') {
    // closed and kind: a line from the lips back into the cheek, turning up, and a little dimple
    g.lineWidth = 0.06 * R;
    g.beginPath();
    g.moveTo(...P(-0.2, -0.28));
    g.quadraticCurveTo(...P(-0.07, -0.37), ...P(0.05, -0.23));
    g.stroke();
    g.lineWidth = 0.04 * R;
    g.beginPath();
    g.moveTo(...P(0.03, -0.19));
    g.quadraticCurveTo(...P(0.07, -0.22), ...P(0.07, -0.27));
    g.stroke();
    return;
  }
  if (shape === 'mid' || shape === 'grin') {
    // open at the lips: a top edge back into the cheek and a deep lower lip; the grin wider with a tongue in the cheeks' colour
    const outline = shape === 'grin'
      ? [[-0.25, -0.22], [-0.06, -0.27], [0.09, -0.18], [-0.03, -0.52], [-0.25, -0.34]]
      : [[-0.22, -0.26], [-0.09, -0.3], [0.02, -0.24], [-0.08, -0.42], [-0.22, -0.31]];
    path(outline);
    g.fill();
    if (shape === 'grin') {
      g.save();
      path(outline);
      g.clip();
      softDisc(g, ...P(-0.1, -0.44), 0.11 * R, '#f48a5c', 1, 0.04 * R); // the sun's cheek colour, as its grin's tongue
      g.restore();
    }
    g.lineWidth = 0.05 * R;
    path(outline);
    g.stroke();
    return;
  }
  if (shape === 'oh') {
    // the lips pushed out round a small "o"
    g.fillStyle = PAINT.mid;
    g.lineWidth = 0.045 * R;
    g.beginPath();
    g.ellipse(...P(-0.24, -0.31), 0.085 * R, 0.1 * R, 0, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = PAINT.ink;
    g.beginPath();
    g.ellipse(...P(-0.25, -0.31), 0.042 * R, 0.058 * R, 0, 0, TAU);
    g.fill();
    return;
  }
  // blow: the cheek puffed and the lips pursed out to the blower
  softDisc(g, ...P(0.02, -0.21), 0.17 * R, PAINT.cheek, 0.55, 0.12 * R);
  g.fillStyle = PAINT.mid;
  g.lineWidth = 0.045 * R;
  g.beginPath();
  g.ellipse(...P(-0.28, -0.31), 0.1 * R, 0.065 * R, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = PAINT.ink;
  g.beginPath();
  g.arc(...P(-0.36, -0.31), 0.026 * R, 0, TAU);
  g.fill();
}

/** The party hat in a square of `S` px at (x, y): a striped cone with dots, a frilled brim and a pom-pom, in the face's ink. */
function paintHat(g, x, y, S) {
  const H = (sx, sy) => [x + sx * S, y + sy * S];
  const line = 0.05 * R_PX;
  const cone = () => {
    g.beginPath();
    g.moveTo(...H(0.2, 0.86));
    g.quadraticCurveTo(...H(0.32, 0.48), ...H(0.5, 0.16));
    g.quadraticCurveTo(...H(0.68, 0.48), ...H(0.8, 0.86));
    g.quadraticCurveTo(...H(0.5, 0.94), ...H(0.2, 0.86)); // a round base, to sit on a round head
    g.closePath();
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = PAINT.ink;
  g.lineWidth = 2 * line;
  cone();
  g.stroke();
  const cloth = g.createLinearGradient(...H(0.3, 0.3), ...H(0.75, 0.85));
  cloth.addColorStop(0, HAT_PAINT.cloth);
  cloth.addColorStop(1, HAT_PAINT.deep);
  g.fillStyle = cloth;
  cone();
  g.fill();
  g.save();
  cone();
  g.clip();
  g.strokeStyle = HAT_PAINT.stripe;
  g.lineWidth = 0.075 * S;
  for (const sy of [0.42, 0.64, 0.88]) {
    g.beginPath();
    g.moveTo(...H(0.1, sy));
    g.lineTo(...H(0.9, sy - 0.22));
    g.stroke();
  }
  g.fillStyle = HAT_PAINT.dot;
  for (const [sx, sy] of [[0.42, 0.5], [0.58, 0.74], [0.38, 0.76], [0.55, 0.35]]) {
    g.beginPath();
    g.arc(...H(sx, sy), 0.028 * S, 0, TAU);
    g.fill();
  }
  g.restore();
  // the frilled brim: a row of small soft scallops along the base
  const frill = [0, 1, 2, 3, 4, 5].map(k => H(0.22 + 0.112 * k, 0.87 + 0.025 * Math.sin((k / 5) * Math.PI)));
  g.fillStyle = PAINT.ink;
  for (const [px, py] of frill) { g.beginPath(); g.arc(px, py, 0.06 * S + line, 0, TAU); g.fill(); }
  g.fillStyle = HAT_PAINT.brim;
  for (const [px, py] of frill) { g.beginPath(); g.arc(px, py, 0.06 * S, 0, TAU); g.fill(); }
  // the pom-pom at the tip, of a few soft balls (as the sun's nightcap's)
  const [px, py] = H(0.5, 0.13);
  const balls = [[0, 0, 0.065], [-0.045, -0.025, 0.042], [0.045, -0.025, 0.042], [-0.04, 0.035, 0.042], [0.04, 0.035, 0.042]];
  g.fillStyle = PAINT.ink;
  for (const [bx, by, r] of balls) { g.beginPath(); g.arc(px + bx * S, py + by * S, r * S + line, 0, TAU); g.fill(); }
  g.fillStyle = HAT_PAINT.stripe;
  for (const [bx, by, r] of balls) { g.beginPath(); g.arc(px + bx * S, py + by * S, r * S, 0, TAU); g.fill(); }
}

/** The hand, fingers up, in a square of `S` px at (x, y): the sun's mitten (sun-face.js paintHand) in the moon's cream. */
function paintHand(g, x, y, S) {
  const line = 0.05 * R_PX;
  const shapes = [[0.53, 0.5, 0.255, 0.3, 0], [0.255, 0.585, 0.085, 0.155, -0.55]];
  const shape = ([cx, cy, rx, ry, turn]) => {
    g.beginPath();
    g.ellipse(x + cx * S, y + cy * S, rx * S, ry * S, turn, 0, TAU);
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = PAINT.ink;
  g.lineWidth = 2 * line;
  for (const s of shapes) { shape(s); g.stroke(); }
  const cream = g.createRadialGradient(x + 0.47 * S, y + 0.42 * S, 0, x + 0.5 * S, y + 0.5 * S, 0.36 * S);
  cream.addColorStop(0, PAINT.core);
  cream.addColorStop(0.45, PAINT.mid);
  cream.addColorStop(1, PAINT.rim);
  g.fillStyle = cream;
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

/** The blower's paper tube, blown out, in its cell: its far end on the left, the mouthpiece on the right, striped as the hat. */
function paintTube(g, [x, y, w, h]) {
  const line = 0.035 * R_PX;
  const r = h / 2 - line;
  const body = () => {
    g.beginPath();
    g.moveTo(x + line + r, y + line);
    g.lineTo(x + w - line, y + line + 0.15 * h);
    g.lineTo(x + w - line, y + h - line - 0.15 * h);
    g.lineTo(x + line + r, y + h - line);
    g.arc(x + line + r, y + h / 2, r, Math.PI / 2, -Math.PI / 2);
    g.closePath();
  };
  g.lineJoin = 'round';
  g.strokeStyle = PAINT.ink;
  g.lineWidth = 2 * line;
  body();
  g.stroke();
  g.fillStyle = HAT_PAINT.cloth;
  body();
  g.fill();
  g.save();
  body();
  g.clip();
  g.fillStyle = HAT_PAINT.stripe;
  for (let k = x + 6; k < x + w - 18; k += 16) g.fillRect(k, y, 7, h);
  g.fillStyle = HAT_PAINT.brim; // the mouthpiece
  g.fillRect(x + w - 14, y, 14, h);
  g.restore();
}

/** The blower rolled up: a coil of the same striped paper, in its cell. */
function paintCurl(g, [x, y, w]) {
  const c = [x + w / 2, y + w / 2];
  const coil = () => {
    g.beginPath();
    for (let a = 0; a <= 3 * Math.PI; a += 0.08) {
      const r = 3 + 2.1 * a;
      const p = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
      if (a === 0) g.moveTo(...p);
      else g.lineTo(...p);
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = PAINT.ink;
  g.lineWidth = 9;
  coil();
  g.stroke();
  g.strokeStyle = HAT_PAINT.cloth;
  g.lineWidth = 5.5;
  coil();
  g.stroke();
  g.strokeStyle = HAT_PAINT.stripe;
  g.lineWidth = 1.6;
  coil();
  g.stroke();
}

const canvasTexture = canvas => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** The face as a strip of frames, from the left: the eye open, half shut, shut. Null where there is no page. */
export function drawMoonFrames() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * FRAMES;
  canvas.height = FRAME;
  const g = canvas.getContext('2d');
  Object.keys(FRAME_OF).forEach((eye, frame) => {
    g.save();
    g.translate(frame * FRAME, 0);
    paintMoon(g, eye);
    g.restore();
  });
  return canvasTexture(canvas);
}

/** The overlay's sheet: the mouths (and the in-between) along the top; the hat, the hand and the blower blown out and rolled up under them. Null where there is no page. */
export function drawMoonSheet() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = SHEET;
  const g = canvas.getContext('2d');
  for (const [shape, x] of Object.entries(MOUTH_CELLS)) paintMouth(g, mapper(x + MOUTH_PX / 2, MOUTH_PX / 2, MOUTH_AT), shape);
  paintHat(g, HAT_CELL[0], HAT_CELL[1], HAT_PX);
  paintHand(g, HAND_CELL[0], HAND_CELL[1], HAND_PX);
  paintTube(g, TUBE_CELL);
  paintCurl(g, CURL_CELL);
  return canvasTexture(canvas);
}

// ---------------------------------------------------------------------------------------------
// What it does, as a pure function of the acts and the time

const PEEK = { up: 0.9, look: [0.9, 2.1], eye: 0.43, lean: 8 }; // up to its eye in 0.9 s, a look each way, then all the way
const KNOCK = { seconds: 0.18, wobble: 3, period: 0.32, fade: 0.25 };
const FIX = { reach: 0.5, turn: [0.5, 1.1] }; // the hand reaches the hat, turns it straight, and goes back by the end
const TIP_AT = { reach: 0.4, back: 1.6 };
const ROCK_HOLD = 0.4; // seconds the hand takes to and from the hat when it rocks

/** The blinks' start times on the clock: seeded ('moon'), worked out as far as asked, the same for every face and every order. */
const blinkStarts = [];
const blinkRandom = seededRandom('moon');
const blinkGap = () => MOON_BLINK.every[0] + (MOON_BLINK.every[1] - MOON_BLINK.every[0]) * blinkRandom();
function blinkBefore(t) {
  if (!blinkStarts.length) blinkStarts.push(blinkGap());
  while (blinkStarts.at(-1) <= t) blinkStarts.push(blinkStarts.at(-1) + blinkGap());
  if (blinkStarts[0] > t) return -Infinity;
  let lo = 0;
  let hi = blinkStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (blinkStarts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return blinkStarts[lo];
}
function eyeAt(t) {
  const b = t - blinkBefore(t);
  if (!(b < MOON_BLINK.seconds)) return 'open';
  return b < 0.05 || b >= MOON_BLINK.seconds - 0.07 ? 'half' : 'shut';
}

const lengthOf = act => {
  if (act.kind in MOON_ACTS) return MOON_ACTS[act.kind];
  if (act.kind === 'smile' || act.kind === 'oh') return act.seconds ?? MOON_MOUTH_SECONDS;
  if (act.kind === 'rock') return act.seconds ?? Infinity;
  return 0; // askew: a knock, and the hat stays askew until fixHat
};
/** The last of `list` under way at t (begun, not over), or null. */
const underWay = (list, t) => {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].at <= t && t < list[i].at + lengthOf(list[i])) return list[i];
  return null;
};

function riseAt(list, t) {
  const peeks = list.filter(a => a.kind === 'peek');
  if (!peeks.length) return 1; // nobody asked it to peek: it is up
  let last = null;
  for (const p of peeks) if (p.at <= t) last = p;
  if (!last) return 0;
  const u = t - last.at;
  if (u >= MOON_ACTS.peek) return 1;
  if (u < PEEK.up) return PEEK.eye * smoother(u / PEEK.up);
  if (u < PEEK.look[1]) return PEEK.eye;
  return lerp(PEEK.eye, 1, smoother((u - PEEK.look[1]) / (MOON_ACTS.peek - PEEK.look[1])));
}

function swayAt(list, t) {
  let sway = 0;
  const peek = underWay(list.filter(a => a.kind === 'peek'), t);
  if (peek) {
    const u = t - peek.at;
    if (u > PEEK.look[0] && u < PEEK.look[1]) sway += PEEK.lean * Math.sin((TAU * (u - PEEK.look[0])) / (PEEK.look[1] - PEEK.look[0]));
  }
  const rock = underWay(list.filter(a => a.kind === 'rock'), t);
  if (rock) {
    const perBeat = (rock.bpm ?? 84) / 60;
    const b = (t - rock.at) * perBeat;
    const left = (rock.at + lengthOf(rock) - t) * perBeat;
    const grown = smoother(clamp(b, 0, 1)) * smoother(clamp(left, 0, 1));
    sway += MOON_ROCK_DEG * grown * Math.sin(Math.PI * (b - 0.5)); // furthest over on each beat, upright between
  }
  return sway;
}

/** The hat's askew degrees at t from the knocks and the fixes before it: each from where the one before had left it. */
function hatAt(list, t) {
  const hats = list.filter(a => a.kind === 'askew' || a.kind === 'fixHat');
  const at = (k, time) => {
    if (k < 0) return 0;
    const act = hats[k];
    const from = at(k - 1, act.at);
    const u = time - act.at;
    if (act.kind === 'askew') {
      let v = lerp(from, MOON_ASKEW_DEG, smoother(clamp(u / KNOCK.seconds, 0, 1)));
      if (u > KNOCK.seconds) v += KNOCK.wobble * Math.sin((TAU * (u - KNOCK.seconds)) / KNOCK.period) * Math.exp(-(u - KNOCK.seconds) / KNOCK.fade);
      return v;
    }
    return lerp(from, 0, smoother(clamp((u - FIX.turn[0]) / (FIX.turn[1] - FIX.turn[0]), 0, 1)));
  };
  let k = -1;
  for (let i = 0; i < hats.length; i++) if (hats[i].at <= t) k = i;
  return at(k, t);
}

function handAt(list, t) {
  const act = underWay(list.filter(a => a.kind === 'fixHat' || a.kind === 'wave' || a.kind === 'tipHat' || a.kind === 'rock'), t);
  if (!act) return { kind: 'rest', u: 0 };
  const u = t - act.at;
  if (act.kind === 'wave') return { kind: 'wave', u: u / MOON_ACTS.wave };
  if (act.kind === 'fixHat') {
    if (u < FIX.reach) return { kind: 'hat', u: smoother(u / FIX.reach) };
    if (u < FIX.turn[1]) return { kind: 'hat', u: 1 };
    return { kind: 'hat', u: 1 - smoother((u - FIX.turn[1]) / (MOON_ACTS.fixHat - FIX.turn[1])) };
  }
  if (act.kind === 'tipHat') {
    if (u < TIP_AT.reach) return { kind: 'hat', u: smoother(u / TIP_AT.reach) };
    if (u < TIP_AT.back) return { kind: 'tip', u: Math.sin((Math.PI * (u - TIP_AT.reach)) / (TIP_AT.back - TIP_AT.reach)) };
    return { kind: 'hat', u: 1 - smoother((u - TIP_AT.back) / (MOON_ACTS.tipHat - TIP_AT.back)) };
  }
  // rock: on the hat while it rocks
  const left = act.at + lengthOf(act) - t;
  return { kind: 'hat', u: smoother(clamp(u / ROCK_HOLD, 0, 1)) * smoother(clamp(left / ROCK_HOLD, 0, 1)) };
}

const MOUTH_OF = { smile: 'grin', oh: 'oh', toot: 'blow' };
function rawMouth(list, t) {
  const act = underWay(list.filter(a => a.kind in MOUTH_OF), t);
  return act ? MOUTH_OF[act.kind] : 'smile';
}

/** One blow of the blower over [a, b] s: out fast, held, and rolled back. */
function blowOut(u, a, b) {
  if (u <= a || u >= b) return 0;
  const x = (u - a) / (b - a);
  if (x < 0.25) return smoother(x / 0.25);
  if (x < 0.5) return 1;
  return 1 - smoother((x - 0.5) / 0.5);
}
function blowerAt(list, t) {
  const toot = underWay(list.filter(a => a.kind === 'toot'), t);
  if (!toot) return 0;
  const u = t - toot.at;
  return Math.max(blowOut(u, 0.15, 0.95), blowOut(u, 1.05, 1.85)); // "Tút! Tút!"
}

/**
 * The moon's pose at `time` from `acts` (pure: the same acts and time give the same pose, whatever was asked before):
 *   acts  [{ kind, at, seconds?, bpm? }], kind one of
 *         'peek'   up over the sea of cloud to its eye, a look left and right, then all the way up (MOON_ACTS.peek s); before its
 *                  first peek it is under the sea (rise 0); with no peek among the acts it is up
 *         'smile'  a big smile (the mouth 'grin') for `seconds` (MOON_MOUTH_SECONDS)
 *         'toot'   the mouth to 'blow' and the blower out and back twice (MOON_ACTS.toot s)
 *         'askew'  the roar knocks the hat MOON_ASKEW_DEG over; it stays so until a 'fixHat'
 *         'fixHat' the hand reaches the hat, turns it straight and goes back (MOON_ACTS.fixHat s)
 *         'oh'     the mouth "o" for `seconds` (MOON_MOUTH_SECONDS)
 *         'wave'   the hand up beside it, four swings, and down (MOON_ACTS.wave s)
 *         'tipHat' the hand lifts the hat off its head and puts it back (MOON_ACTS.tipHat s): the ride back's goodbye
 *         'rock'   it sways on the beat (`bpm`, 84 if not given), furthest over on each beat, the hand on its hat, for `seconds`
 *   It blinks by itself every 3 to 6 s (MOON_BLINK). Of acts that overlap, the later one has the mouth, or the hand.
 * Returns { rise, sway, eye, mouth, hand: { kind, u }, hat, blower } as createMoonFace's set takes it: rise 0 (under the sea) to 1 (its
 * place); sway degrees it leans, clockwise; hat degrees its hat is knocked forward over its brow; blower 0 (rolled) to 1 (out).
 */
export function moonPose(acts = [], time = 0) {
  const list = acts.map((a, i) => {
    if (!KINDS.includes(a?.kind)) throw new TypeError(`a moon act's kind is one of ${KINDS.join(', ')}, not ${JSON.stringify(a?.kind)}`);
    return { ...a, i };
  }).sort((a, b) => a.at - b.at || a.i - b.i);
  const mouth = rawMouth(list, time);
  return {
    rise: riseAt(list, time),
    sway: swayAt(list, time),
    eye: eyeAt(time),
    mouth: mouth === rawMouth(list, time - MOON_BETWEEN) ? mouth : 'mid', // a change passes through the in-between
    hand: handAt(list, time),
    hat: hatAt(list, time),
    blower: blowerAt(list, time),
  };
}

// ---------------------------------------------------------------------------------------------
// The picture

/** (x, y) turned `degrees` clockwise. */
const turnCW = (x, y, degrees) => {
  const a = rad(degrees);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + y * s, -x * s + y * c];
};
const mixPose = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), angle: lerp(a.angle, b.angle, k) });

const WAVE_RATE = WAVE.swings / (MOON_ACTS.wave - WAVE.raise - WAVE.lower);
/** The hand's wrist and angle `s` seconds into a wave (sun-face.js's wave, on the moon's side). */
function waveHand(s) {
  const down = MOON_ACTS.wave - WAVE.lower;
  let out;
  if (s < WAVE.raise) out = mixPose(HAND_REST, WAVE.up, smoother(s / WAVE.raise));
  else if (s >= down) out = mixPose(WAVE.up, HAND_REST, smoother(clamp((s - down) / WAVE.lower, 0, 1)));
  else out = { ...WAVE.up };
  const grown = smoother(clamp((s - WAVE.raise + WAVE.grow) / WAVE.grow, 0, 1)) * smoother(clamp((down + WAVE.grow - s) / WAVE.grow, 0, 1));
  const swing = TAU * WAVE_RATE * (s - WAVE.raise);
  out.x += 0.04 * grown * Math.sin(swing);
  out.y += 0.02 * grown * Math.sin(2 * swing);
  out.angle += WAVE.swing * grown * Math.sin(swing);
  return out;
}

/** The most a pose's `hatLift` raises the hat off its head (radii): a bob, never off it. */
export const MOON_HAT_LIFT = 0.12;
/** The hat's brim point and angle for a pose (unswayed local): lifted and turned while the hand tips it, and lifted a little by a pose's `hatLift` (radii, 0 to MOON_HAT_LIFT; the festival's dance bobs it on the beat). */
function hatFrame(pose) {
  const tip = pose.hand?.kind === 'tip' ? clamp(pose.hand.u, 0, 1) : 0;
  const bob = clamp(Number(pose.hatLift) || 0, 0, MOON_HAT_LIFT);
  return { x: HAT_AT[0], y: HAT_AT[1] + TIP.lift * tip + bob, angle: HAT_TILT - (Number(pose.hat) || 0) + TIP.tilt * tip };
}
/** A place in the hat's square (from its top left, a side being 1) as unswayed local. */
function onHat(frame, sx, sy) {
  const [dx, dy] = turnCW((sx - HAT_PIVOT[0]) * MOON.hat, (HAT_PIVOT[1] - sy) * MOON.hat, frame.angle);
  return [frame.x + dx, frame.y + dy];
}
/** The wrist and angle that put the hand's middle at (mx, my) with its fingers at `angle`. */
function handFromMiddle(mx, my, angle) {
  const [dx, dy] = turnCW(-HAND_PIVOT[0] * MOON.hand, -HAND_PIVOT[1] * MOON.hand, angle);
  return { x: mx - dx, y: my - dy, angle };
}
function handPose(pose, frame) {
  const hand = pose.hand ?? { kind: 'rest', u: 0 };
  const u = clamp(Number(hand.u) || 0, 0, 1);
  if (hand.kind === 'wave') return waveHand(u * MOON_ACTS.wave);
  if (hand.kind === 'hat' || hand.kind === 'tip') {
    const grip = handFromMiddle(...onHat(frame, ...HAT_GRIP), frame.angle - 75);
    if (hand.kind === 'tip') return grip;
    const k = smoother(u);
    const out = mixPose(HAND_REST, grip, k);
    out.y += 0.15 * Math.sin(Math.PI * k); // over its round back on the way
    return out;
  }
  return { ...HAND_REST };
}

/**
 * The moon: a sprite (its face, the strip's frame for its eye) and one overlay mesh of MOON_QUADS (mouth, blower, hat, hand), both
 * SUN_DISTANCE from the camera toward (azimuth, elevation), the caller's place (hatid-route.js SKY.moon), when it is up.
 *   set(pose)       the pose to show (moonPose's): a number to show, the same pose the same picture
 *   pose            the pose set last
 *   update(camera)  hangs it from the camera, flat to the screen; call it after the camera has moved, before the render
 *   points          { centre, eye, mouth, hand, hatTip, top, bottom }: where those are in the world after the last update
 *   radiusDeg       MOON.radiusDeg
 *   dispose()
 * `texture` is the strip of three frames and `sheet` the overlay's; the page paints them, a test passes its own (or null).
 */
export function createMoonFace({ scene, texture = drawMoonFrames(), sheet = drawMoonSheet(), azimuth, elevation }) {
  if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) {
    throw new TypeError(`the moon's place is the caller's: an azimuth and an elevation in degrees (hatid-route.js SKY.moon), not ${azimuth}, ${elevation}`);
  }
  const R = SUN_DISTANCE * Math.tan(rad(MOON.radiusDeg)); // the disc's radius in metres
  const material = farPlaneDepth(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }), 'moon-face-far');
  const sprite = new THREE.Sprite(material);
  sprite.name = 'MoonFace';
  sprite.renderOrder = -2.5; // over the night sky and the constellations, under the sun's face
  sprite.scale.setScalar((2 * R) / DISC_OF_FRAME);
  scene.add(sprite);
  texture?.repeat.set(1 / FRAMES, 1);

  const count = Object.keys(MOON_QUADS).length;
  const geometry = new THREE.BufferGeometry();
  const corners = new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const uvs = new THREE.BufferAttribute(new Float32Array(count * 4 * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', corners);
  geometry.setAttribute('uv', uvs);
  geometry.setIndex(Array.from({ length: count }, (_, q) => [0, 1, 2, 0, 2, 3].map(k => 4 * q + k)).flat());
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.6 * R); // the hat lifted and the hand up
  const overlay = new THREE.Mesh(geometry, farPlaneDepth(new THREE.MeshBasicMaterial({
    map: sheet, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }), 'moon-overlay-far'));
  overlay.name = 'MoonMouthHatAndHand';
  overlay.renderOrder = -2.4;
  scene.add(overlay);

  const setCell = (quad, [x, y, w, h]) => {
    const u0 = x / SHEET[0];
    const u1 = (x + w) / SHEET[0];
    const top = 1 - y / SHEET[1];
    const bottom = 1 - (y + h) / SHEET[1];
    [[u0, bottom], [u1, bottom], [u1, top], [u0, top]].forEach(([u, v], k) => uvs.setXY(quad * 4 + k, u, v));
    uvs.needsUpdate = true;
  };
  setCell(MOON_QUADS.hat, HAT_CELL);
  setCell(MOON_QUADS.hand, HAND_CELL);
  setCell(MOON_QUADS.curl, CURL_CELL);

  // the quads' corners (bottom left, bottom right, top right, top left) in unswayed local, worked out at set()
  const local = new Float32Array(count * 4 * 2);
  const square = (quad, cx, cy, side, angle = 0, pivot = [0, 0]) => {
    // a square of `side` turned `angle` clockwise about the point `pivot` (from its middle, a side being 1), that point at (cx, cy)
    [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([x, y], k) => {
      const [dx, dy] = turnCW((x - pivot[0]) * side, (y - pivot[1]) * side, angle);
      local[(quad * 4 + k) * 2] = cx + dx;
      local[(quad * 4 + k) * 2 + 1] = cy + dy;
    });
  };
  const collapse = quad => { for (let k = 0; k < 8; k++) local[quad * 8 + k] = 0; };
  const parts = { centre: [0, 0], eye: EYE_AT, mouth: MOUTH_POINT, hand: [0, 0], hatTip: [0, 0], top: [0, 1], bottom: [0, -1] };
  const points = Object.fromEntries(Object.keys(parts).map(k => [k, new THREE.Vector3()]));
  let shown = null;
  let sway = 0;
  const direction = new THREE.Vector3();

  function set(pose) {
    shown = structuredClone(pose);
    const rise = clamp(Number(pose.rise) || 0, 0, 1);
    const e = rad(lerp(MOON.under, elevation, rise));
    const a = rad(azimuth);
    direction.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
    sway = Number(pose.sway) || 0;
    material.rotation = -rad(sway); // a sprite turns counter-clockwise; the moon's angles are clockwise
    if (texture) texture.offset.x = (FRAME_OF[pose.eye] ?? 0) / FRAMES;
    const mouth = pose.mouth in MOUTH_CELLS ? pose.mouth : 'smile';
    setCell(MOON_QUADS.mouth, [MOUTH_CELLS[mouth], 0, MOUTH_PX, MOUTH_PX]);
    square(MOON_QUADS.mouth, ...MOUTH_AT, MOUTH_PX / R_PX);
    // the blower, only while it blows: its tube out of the lips as far as it is blown, its curl at the tube's end
    const blower = clamp(Number(pose.blower) || 0, 0, 1);
    if (mouth === 'blow') {
      const dir = [-Math.cos(BLOW_DIR), -Math.sin(BLOW_DIR)];
      const n = [-dir[1], dir[0]]; // its side, a quarter turn from it: its lower side (the blower points left)
      const length = TUBE.length * blower;
      const far = [LIPS[0] + dir[0] * length, LIPS[1] + dir[1] * length];
      const hw = TUBE.width / 2;
      // bottom left (the far end, low), bottom right (at the lips), top right, top left: wound to face the camera
      [[far, 1], [LIPS, 1], [LIPS, -1], [far, -1]].forEach(([p, side], k) => {
        local[(MOON_QUADS.tube * 4 + k) * 2] = p[0] + side * n[0] * hw;
        local[(MOON_QUADS.tube * 4 + k) * 2 + 1] = p[1] + side * n[1] * hw;
      });
      setCell(MOON_QUADS.tube, [TUBE_CELL[0] + TUBE_CELL[2] * (1 - blower), TUBE_CELL[1], TUBE_CELL[2] * blower, TUBE_CELL[3]]);
      const size = lerp(CURL.rolled, CURL.out, blower);
      // the curl hangs from the tube's end, below it
      square(MOON_QUADS.curl, far[0] + n[0] * size * 0.4 + dir[0] * size * 0.25, far[1] + n[1] * size * 0.4 + dir[1] * size * 0.25, size);
    } else {
      collapse(MOON_QUADS.tube);
      collapse(MOON_QUADS.curl);
    }
    const frame = hatFrame(pose);
    square(MOON_QUADS.hat, frame.x, frame.y, MOON.hat, frame.angle, [0, 0.5 - HAT_PIVOT[1]]);
    parts.hatTip = [frame.x + turnCW(0, HAT_TOP * MOON.hat, frame.angle)[0], frame.y + turnCW(0, HAT_TOP * MOON.hat, frame.angle)[1]];
    const hand = handPose(pose, frame);
    square(MOON_QUADS.hand, hand.x, hand.y, MOON.hand, hand.angle, [HAND_PIVOT[0], HAND_PIVOT[1]]);
    const middle = turnCW(-HAND_PIVOT[0] * MOON.hand, -HAND_PIVOT[1] * MOON.hand, hand.angle);
    parts.hand = [hand.x + middle[0], hand.y + middle[1]];
  }

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  function update(camera) {
    sprite.position.copy(camera.position).addScaledVector(direction, SUN_DISTANCE);
    overlay.position.copy(sprite.position);
    camera.getWorldQuaternion(turn);
    right.set(1, 0, 0).applyQuaternion(turn);
    up.set(0, 1, 0).applyQuaternion(turn);
    const put = (i, x, y) => {
      const [sx, sy] = turnCW(x, y, sway);
      corners.setXYZ(i, (right.x * sx + up.x * sy) * R, (right.y * sx + up.y * sy) * R, (right.z * sx + up.z * sy) * R);
    };
    for (let i = 0; i < count * 4; i++) put(i, local[2 * i], local[2 * i + 1]);
    corners.needsUpdate = true;
    overlay.updateMatrixWorld();
    for (const [k, [x, y]] of Object.entries(parts)) {
      const [sx, sy] = turnCW(x, y, sway);
      points[k].copy(sprite.position).addScaledVector(right, sx * R).addScaledVector(up, sy * R);
    }
  }

  set(moonPose([], 0)); // up, smiling, until told
  return {
    sprite,
    overlay,
    set,
    get pose() { return structuredClone(shown); },
    update,
    get points() { return points; },
    get radiusDeg() { return MOON.radiusDeg; },
    dispose() {
      scene.remove(sprite);
      scene.remove(overlay);
      geometry.dispose();
      material.dispose();
      overlay.material.dispose();
    },
  };
}
