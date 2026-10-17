import * as THREE from 'three';
import { pickLook } from './looks.js';
import { seededRandom } from './random.js';

// The smiling sun (spec: "Brosandi sól") and the cloud shaped like Mosi (spec: "Ský"). Both are painted
// on small canvases at start-up and hang in the sky as camera-facing sprites 600 m out, just beyond the
// sky dome, always in the same direction from the camera, as the sky itself is. Neither is fogged (at
// 600 m the height fog would erase them), and each draws in one call.
//
// Everything that moves is a pure function of the game clock: main.js hands `update(t, camera)` the
// clock's time, so a pause holds the picture and a `?t=` capture lands on the same frame as playing.
// There is no canvas in Node: without a page the sprites have no texture, and the tests hand in their
// own stand-in to see which frame of the face is showing.

const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const { lerp, clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const ORIGIN = new THREE.Vector3();

export const SUN_DISTANCE = 600; // metres from the camera; engine/points.js uses it for the 'sun' point
export const WINK_SECONDS = 0.35;
// The wink passes through a half-shut face going down and coming back up (the owner asked for it: it reads softer), the way up a
// little slower, as a blink opens slower than it shuts (eyelids.js).
const HALF_DOWN = 0.06; // seconds of the half-shut face at the start of a wink
const HALF_UP = 0.09; // and at its end
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

/** One frame of the face, in a square of FRAME px with the sun's centre in the middle; `eyes` is 'open', 'half' or 'shut'. */
function paintSun(g, eyes) {
  const c = FRAME / 2;
  const R = c * DISC_OF_FRAME;

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

  // A closed, kind smile.
  g.lineWidth = 0.065 * R;
  g.beginPath();
  g.moveTo(c - 0.3 * R, c + 0.3 * R);
  g.quadraticCurveTo(c, c + 0.6 * R, c + 0.3 * R, c + 0.3 * R);
  g.stroke();
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

/**
 * The sun's face: a sprite along `lighting.direction`, 600 m from the camera, over the sky's own sun disc.
 *   sprite       the THREE.Sprite, in `scene`
 *   wink()       shuts the eyes for 0.35 s of game time, counted from the next update: half shut, shut, half shut
 *   update(t, camera)  t is the game clock in seconds; call it after the camera has moved
 *   eyes         'open', 'half' or 'shut': which frame of the face shows
 *   eyesClosed   whether a wink shows (the half-shut frames too)
 *   radiusDeg    the painted disc's angular radius, as seen from the camera
 * `texture` is the strip of FRAMES frames; the page draws it, a test can pass its own.
 */
export function createSunFace({ scene, lighting, texture = drawSunFrames() }) {
  const direction = lighting.direction.clone().normalize();
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'SunFace';
  sprite.renderOrder = -2; // the farthest thing there is: before everything else that blends
  sprite.scale.setScalar((2 * SUN_DISTANCE * Math.tan(rad(SUN_RADIUS_DEG))) / DISC_OF_FRAME);
  scene.add(sprite);
  texture?.repeat.set(1 / FRAMES, 1);
  const hang = origin => sprite.position.copy(origin).addScaledVector(direction, SUN_DISTANCE);
  hang(ORIGIN); // until the first update, as seen from the world's origin: never a giant face on the camera

  let winkPending = false;
  let winkStart = -Infinity;
  let eyes = 'open';

  return {
    sprite,
    wink() { winkPending = true; },
    update(t, camera) {
      hang(camera.position);
      if (winkPending) {
        winkPending = false;
        winkStart = t;
      }
      const into = t - winkStart;
      if (!(into >= 0 && into < WINK_SECONDS)) eyes = 'open';
      else eyes = into < HALF_DOWN || into >= WINK_SECONDS - HALF_UP ? 'half' : 'shut';
      if (texture) texture.offset.x = FRAME_OF[eyes] / FRAMES;
    },
    get eyes() { return eyes; },
    get eyesClosed() { return eyes !== 'open'; },
    get radiusDeg() { return deg(Math.atan(((sprite.scale.x / 2) * DISC_OF_FRAME) / SUN_DISTANCE)); },
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
