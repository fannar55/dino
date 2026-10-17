import * as THREE from 'three';
import { seededRandom } from './random.js';

// Eyelids built in code over a character's painted eyes (STYLE.md section 3: expressive eyes with lids
// that blink). Tripo paints the eyes into the colour map, so a lid cannot fold out of the skin. Instead
// each eye gets a shell: a copy of the skin's own triangles over the eye, skinned by the same bones
// (so it moves with the head, the look and the jaw exactly), drawn on top of the skin. A fragment
// shader keeps only the part of the shell the lids cover: the upper lid comes down from the top of
// the eye's outline and the lower lid up from the bottom, and they meet a little below the middle, so
// a closed eye is a soft downward curve, the friendly "content" shape. A dark lash line runs along
// each lid's edge, and the lids fade into the painted skin round the outline, so no edge shows. With
// the eyes open the shell is hidden, so it costs nothing but while a lid moves.
//
// The eyes come from the model: the face pass (remake/tools/bake/face.js) finds them in the colour
// map and writes `face.eyes` into the GLB as extras on the skinned mesh: per eye its centre, its frame
// (right, down, normal), its outline (half width, height above and below the centre) and the colours
// of the lids (the skin above and below the eye) and the lash line, all in the mesh's bind space.
//
// The blink (createBlink) is a small state machine on the game clock: a blink every 2 to 6 seconds
// (STYLE.md section 9), now and then a double blink, and a resting level that a scene can set (0
// open, 0.5 sleepy, 1 shut) and change over a given time. Its random numbers come from a seed (the
// actor's name), so captures and seeks are exact.

// Where the lids meet when the eye is shut, as a share of the eye's height from its top.
export const MEET = 0.78;
// The lids fade into the skin over this share of the outline beyond it, so no edge shows.
export const FEATHER = 0.3;
// The blink: closing, held shut, opening (seconds).
export const BLINK = { close: 0.07, hold: 0.04, open: 0.13 };
const BLINK_TIME = BLINK.close + BLINK.hold + BLINK.open;

/** The eyes a model carries (face pass data on its skinned mesh), or null. */
export function eyesOf(model) {
  let found = null;
  model.traverse(o => { if (!found && o.isSkinnedMesh && o.userData.face?.eyes?.length) found = { mesh: o, eyes: o.userData.face.eyes }; });
  return found;
}

/**
 * The lid shells' geometry: for each eye, the skin's triangles over its outline (with a margin), facing
 * the way the eye faces, with each vertex's place in the eye's frame (`lid`: across, down, eye index),
 * the eye's outline (`lidShape`: half width, top, bottom), and the lid and lash colours.
 */
export function buildLidGeometry(source, eyes) {
  const { position, normal, skinIndex, skinWeight } = source.attributes;
  const index = source.index.array;
  const out = { position: [], normal: [], skinIndex: [], skinWeight: [], lid: [], lidShape: [], lidTop: [], lidBottom: [], lash: [], index: [] };
  const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  eyes.forEach((eye, k) => {
    const centre = new THREE.Vector3().fromArray(eye.centre);
    const right = new THREE.Vector3().fromArray(eye.right);
    const down = new THREE.Vector3().fromArray(eye.down);
    const facing = new THREE.Vector3().fromArray(eye.normal);
    const grow = 1.1 * (1 + FEATHER);
    const reach = { u: grow * eye.halfWidth, top: grow * eye.top, bottom: grow * eye.bottom };
    const depth = 0.8 * grow * Math.max(eye.halfWidth, eye.top, eye.bottom);
    // A hair above the skin; the material's polygon offset does the rest.
    const lift = 0.002 * Math.min(eye.halfWidth, eye.top + eye.bottom);
    const lidTop = new THREE.Color(eye.lid);
    const lidBottom = new THREE.Color(eye.under ?? eye.lid);
    const lash = new THREE.Color(eye.lash);
    const copies = new Map();
    const copy = i => {
      if (copies.has(i)) return copies.get(i);
      p.fromBufferAttribute(position, i);
      n.fromBufferAttribute(normal, i);
      const d = p.clone().sub(centre);
      p.addScaledVector(n, lift);
      out.position.push(p.x, p.y, p.z);
      // A lid is smooth skin stretched over the eyeball, not the sculpted socket under it: inside the
      // outline its normals are a gentle dome round the eye's own, blending back to the skin's in the
      // feather so the light matches there.
      const u = d.dot(right) / eye.halfWidth, v = d.dot(down) / (d.dot(down) < 0 ? eye.top : eye.bottom);
      const dome = facing.clone().addScaledVector(right, 0.45 * u).addScaledVector(down, 0.45 * v).normalize();
      const r = Math.hypot(u, v);
      const x = THREE.MathUtils.clamp((r - 1) / FEATHER, 0, 1);
      n.lerp(dome, 1 - x * x * (3 - 2 * x)).normalize();
      out.normal.push(n.x, n.y, n.z);
      for (let j = 0; j < 4; j++) { out.skinIndex.push(skinIndex.getComponent(i, j)); out.skinWeight.push(skinWeight.getComponent(i, j)); }
      out.lid.push(d.dot(right), d.dot(down), k, 0);
      out.lidShape.push(eye.halfWidth, eye.top, eye.bottom);
      out.lidTop.push(lidTop.r, lidTop.g, lidTop.b);
      out.lidBottom.push(lidBottom.r, lidBottom.g, lidBottom.b);
      out.lash.push(lash.r, lash.g, lash.b);
      const at = out.position.length / 3 - 1;
      copies.set(i, at);
      return at;
    };
    for (let t = 0; t < index.length; t += 3) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, w0 = Infinity, w1 = -Infinity;
      for (let j = 0; j < 3; j++) {
        p.fromBufferAttribute(position, index[t + j]).sub(centre);
        const u = p.dot(right), v = p.dot(down), w = p.dot(facing);
        u0 = Math.min(u0, u); u1 = Math.max(u1, u);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        w0 = Math.min(w0, w); w1 = Math.max(w1, w);
      }
      if (u1 < -reach.u || u0 > reach.u || v1 < -reach.top || v0 > reach.bottom || w1 < -depth || w0 > depth) continue;
      a.fromBufferAttribute(position, index[t]);
      b.fromBufferAttribute(position, index[t + 1]);
      c.fromBufferAttribute(position, index[t + 2]);
      if (b.sub(a).cross(c.sub(a)).normalize().dot(facing) < -0.1) continue; // facing away: hidden anyway
      out.index.push(copy(index[t]), copy(index[t + 1]), copy(index[t + 2]));
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.skinWeight, 4));
  geometry.setAttribute('lid', new THREE.Float32BufferAttribute(out.lid, 4));
  geometry.setAttribute('lidShape', new THREE.Float32BufferAttribute(out.lidShape, 3));
  geometry.setAttribute('lidTop', new THREE.Float32BufferAttribute(out.lidTop, 3));
  geometry.setAttribute('lidBottom', new THREE.Float32BufferAttribute(out.lidBottom, 3));
  geometry.setAttribute('lash', new THREE.Float32BufferAttribute(out.lash, 3));
  geometry.setIndex(out.index);
  return geometry;
}

// The lids' shader: three's standard material, lit like the skin, everything outside the lids
// discarded. The lids take the skin's colour from above the eye (upper lid) and below it (lower lid),
// darken a little toward their edge, and fade into the painted skin round the eye's outline.
const LID_VERTEX = `
attribute vec4 lid;
attribute vec3 lidShape;
attribute vec3 lidTop;
attribute vec3 lidBottom;
attribute vec3 lash;
varying vec4 vLid;
varying vec3 vLidShape;
varying vec3 vLidTop;
varying vec3 vLidBottom;
varying vec3 vLash;
`;
const LID_FRAGMENT = `
uniform vec2 lidClose;
varying vec4 vLid;
varying vec3 vLidShape;
varying vec3 vLidTop;
varying vec3 vLidBottom;
varying vec3 vLash;
`;
const LID_COVER = `
{
  float close = vLid.z < 0.5 ? lidClose.x : lidClose.y;
  float across = vLid.x / vLidShape.x;
  float height = vLid.y < 0.0 ? vLidShape.y : vLidShape.z;
  // The eye's outline (an ellipse with its own heights above and below the centre): 1 on it.
  float outline = across * across + (vLid.y / height) * (vLid.y / height);
  float inside = 1.0 - smoothstep(1.0, ${((1 + FEATHER) ** 2).toFixed(3)}, outline);
  // s: 0 on the top of the outline, 1 on its bottom, at this point across the eye.
  float k = sqrt(max(1.0 - across * across, 0.0));
  float top = -vLidShape.y * k, bottom = vLidShape.z * k;
  float s = (vLid.y - top) / max(bottom - top, 1e-6);
  float ds = max(fwidth(s), 1e-6);
  float upper = close * ${MEET.toFixed(3)};
  // The lower lid rises only near the end, so half-shut eyes are sleepy, not squinting.
  float lower = 1.0 - close * close * ${(1 - MEET).toFixed(3)};
  float onUpper = clamp(0.5 + (upper - s) / ds, 0.0, 1.0) * step(0.0005, close);
  float onLower = clamp(0.5 + (s - lower) / ds, 0.0, 1.0) * step(0.0005, close);
  float cover = inside * max(onUpper, onLower);
  if (cover < 0.004) discard;
  bool isUpper = onUpper >= onLower;
  float edge = isUpper ? upper - s : s - lower;
  vec3 skin = (isUpper ? vLidTop : vLidBottom) * mix(0.86, 1.0, smoothstep(0.0, 0.35, edge));
  // The lash line along each lid's edge: dark on the upper lid, softer and thinner on the lower one.
  float line = isUpper ? 1.0 - smoothstep(0.1 - ds, 0.1 + ds, edge)
    : 0.6 * smoothstep(0.5, 0.9, close) * (1.0 - smoothstep(0.05 - ds, 0.05 + ds, edge));
  diffuseColor.rgb = mix(skin, vLash, line);
  diffuseColor.a = cover;
}
`;

export function lidMaterial({ roughness = 0.62 } = {}) {
  const material = new THREE.MeshStandardMaterial({
    name: 'eyelids', color: 0xffffff, roughness, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  const uniforms = { lidClose: { value: new THREE.Vector2() } };
  material.userData.lidClose = uniforms.lidClose.value;
  material.onBeforeCompile = shader => {
    shader.uniforms.lidClose = uniforms.lidClose;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${LID_VERTEX}\nvoid main() {\n\tvLid = lid;\n\tvLidShape = lidShape;\n\tvLidTop = lidTop;\n\tvLidBottom = lidBottom;\n\tvLash = lash;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${LID_FRAGMENT}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${LID_COVER}`);
  };
  material.customProgramCacheKey = () => 'eyelids';
  return material;
}

// How shut the lids are at time t into a blink (0 open, 1 shut): they close quickly, hold, and open
// a little slower, easing in and out.
export function blinkShape(t) {
  if (t <= 0 || t >= BLINK_TIME) return 0;
  if (t < BLINK.close) { const x = t / BLINK.close; return x * x; }
  if (t < BLINK.close + BLINK.hold) return 1;
  const x = (t - BLINK.close - BLINK.hold) / BLINK.open;
  return 1 - x * x * (3 - 2 * x);
}

/**
 * The blink driver. update(dt) returns how shut the lids are (0 open, 1 shut). The lids rest at a level
 * a scene sets with rest(level, duration); a blink goes from there to shut and back. No blinks while
 * the eyes rest shut.
 */
export function createBlink({ seed = 'eyes', every = [2, 6], double = 0.2, random = seededRandom(seed) } = {}) {
  const interval = () => every[0] + (every[1] - every[0]) * random();
  let wait = 1 + 3 * random(); // until the next blink starts
  let phase = -1; // time into the current blink, or -1
  let again = false; // a second blink follows this one
  let second = false; // the next blink is that second one
  let count = 0;
  const level = { from: 0, to: 0, t: 0, duration: 0, value: 0 };

  function start(isSecond) {
    phase = 0;
    count++;
    again = !isSecond && random() < double;
  }

  return {
    /** The level the lids rest at (or are going to). */
    get level() { return level.to; },
    get blinking() { return phase >= 0; },
    /** Blinks started so far. */
    get count() { return count; },
    /** Blink now (unless the eyes rest shut or a blink is on). */
    blink() {
      if (phase >= 0 || level.to >= 0.95) return;
      start(false);
      wait = interval();
    },
    /** Rest the lids at `value` (0 open, 0.5 sleepy, 1 shut), reached over `duration` seconds. */
    rest(value, duration = 0.3) {
      level.from = level.value;
      level.to = THREE.MathUtils.clamp(value, 0, 1);
      level.t = 0;
      level.duration = Math.max(0, duration);
    },
    update(dt) {
      level.t += dt;
      const x = level.duration > 0 ? Math.min(1, level.t / level.duration) : 1;
      level.value = level.from + (level.to - level.from) * x * x * (3 - 2 * x);
      // The wait runs from one blink's start to the next one's. A blink that fell due inside this
      // frame starts as far into itself as it is late, so frames of any length blink at the same times.
      wait -= dt;
      if (phase >= 0) {
        phase += dt;
        if (phase >= BLINK_TIME) {
          const over = phase - BLINK_TIME;
          phase = -1;
          if (again) { again = false; second = true; wait = 0.06 - over; }
        }
      }
      if (phase < 0 && wait <= 0) {
        const late = -wait;
        if (level.to < 0.95) { start(second); phase = late; }
        second = false;
        wait += interval();
      }
      return level.value + (1 - level.value) * (phase >= 0 ? blinkShape(phase) : 0);
    },
  };
}

/**
 * Eyelids for a character (null when its model carries no eyes). The shells are added beside the
 * skinned mesh; update(dt) runs the blink and returns how shut the lids are.
 */
export function createEyelids(model, { seed } = {}) {
  const found = eyesOf(model);
  if (!found) return null;
  const { mesh: body, eyes } = found;
  const geometry = buildLidGeometry(body.geometry, eyes);
  const material = lidMaterial({ roughness: body.material.roughness ?? 0.62 });
  const shell = new THREE.SkinnedMesh(geometry, material);
  shell.name = `${body.name} eyelids`;
  shell.castShadow = false;
  shell.receiveShadow = true;
  shell.frustumCulled = false;
  shell.visible = false;
  shell.position.copy(body.position);
  shell.quaternion.copy(body.quaternion);
  shell.scale.copy(body.scale);
  body.parent.add(shell);
  shell.bind(body.skeleton, body.bindMatrix);
  const blink = createBlink({ seed });
  let shut = 0;
  return {
    mesh: shell,
    blink,
    get shut() { return shut; },
    update(dt) {
      shut = blink.update(dt);
      material.userData.lidClose.set(shut, shut);
      shell.visible = shut > 0.002;
      return shut;
    },
    dispose() {
      shell.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
