import * as THREE from 'three';

// The star that rises from the plates of a friend who has accepted the invitation (spec scene 10) and
// waits to be tapped. It is a single sprite, drawn in code, and its whole pose is a function of its age
// in seconds, so it follows the game clock: pausing stops it and a capture finds it in the same place.
// s.star (scene.js) owns one for as long as the star is in the forest.

export const STAR_SIZE = 1.3; // metres across
export const STAR_RADIUS = 0.85; // metres: how big the star is to a tap
const RISE_HEIGHT = 2.4; // metres above the point it rises from
const RISE_TIME = 2.2; // seconds to get there
const POP_TIME = 0.5; // seconds to grow from nothing
const BOB = 0.08; // metres it floats up and down once it is up

const clamp01 = t => Math.min(1, Math.max(0, t));
const smooth = t => t * t * (3 - 2 * t);
/** Grows past its size and settles back. */
const popIn = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

/** A rounded five-point star with a soft glow, on a canvas: gold for a star, the book's colour (STYLE.md section 10). */
function drawStar() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');

  const glow = g.createRadialGradient(64, 66, 10, 64, 66, 62);
  glow.addColorStop(0, 'rgba(255, 241, 207, 0.85)');
  glow.addColorStop(0.5, 'rgba(242, 182, 48, 0.35)');
  glow.addColorStop(1, 'rgba(242, 182, 48, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);

  const shape = (scale) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const radius = (i % 2 ? 17 : 37) * scale;
      g[i ? 'lineTo' : 'moveTo'](64 + radius * Math.cos(angle), 68 + radius * Math.sin(angle));
    }
    g.closePath();
  };
  g.lineJoin = 'round';
  shape(1); // a darker edge so it reads against the sky
  g.lineWidth = 13;
  g.strokeStyle = '#c27d12';
  g.stroke();
  g.lineWidth = 7;
  g.strokeStyle = '#f2b630';
  g.fillStyle = '#f2b630';
  g.stroke();
  g.fill();
  shape(0.5); // and a pale core
  g.fillStyle = 'rgba(255, 241, 207, 0.75)';
  g.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let shared = null; // one texture for every star
function starTexture() {
  if (!shared && typeof document !== 'undefined') shared = drawStar(); // there is no canvas in Node, and no need
  return shared;
}

/**
 * A star that rises from `from` (a THREE.Vector3, metres). Returns
 *   object   the sprite, to add to the scene
 *   point    its position, live: a tap target follows the star by using it as its point spec
 *   at(age)  poses it as it is `age` seconds after it was raised
 *   dispose()
 */
export function createStarSprite({ from, texture = starTexture() }) {
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
  const object = new THREE.Sprite(material);
  object.renderOrder = 20; // after the forest
  const origin = from.clone();

  function at(age) {
    const rise = smooth(clamp01(age / RISE_TIME));
    object.position.set(origin.x, origin.y + RISE_HEIGHT * rise + BOB * rise * Math.sin(age * 3.4), origin.z);
    object.scale.setScalar(STAR_SIZE * popIn(clamp01(age / POP_TIME)) * (1 + 0.07 * Math.sin(age * 7.5)));
    material.rotation = 0.14 * Math.sin(age * 1.7);
  }
  at(0);

  return {
    object,
    point: object.position,
    at,
    dispose() { material.dispose(); },
  };
}
