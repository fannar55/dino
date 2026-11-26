import * as THREE from 'three';
import { farPlaneDepth } from './sun-face.js';
import { skyDirection, SKY_DISTANCE } from './night-sky.js';
import { bodyMesh } from './clip-probe.js';

// The constellations (the festival, chapters/hatid.js scene 2): each friend's own skeleton drawn in stars on the night sky, a star
// on every joint of her skin and a line along every bone, nothing drawn by hand (the chunk's ruling 3): the picture is her pose this
// very frame, seen from her side in her own root's frame, so it moves as she moves and has no dance of its own. Where she stands on
// the top and which way she faces there do not move it. A few `tips` (a crest, a sail, plates) are stars rigid to a bone at a point
// measured on the model's own skin (chapters/hatid-himinn.js, ?measure=1), joined to that bone.
//
// It hangs from the camera as the night sky does (engine/night-sky.js: update(camera)) and is drawn at the far plane's depth
// (farPlaneDepth), so whatever stands in front of the sky hides it. Two draw calls for all of them: the stars (points) and the lines.
// None is fogged or tone mapped.
//
//   STAR_BONE                    'Head': the brightest star, twice the size, the tap star; the lines are drawn out from it
//   skeletonLines(actor, { tips })  { joints, lines, order }: her stars, her lines [joint, parent] and the lines breadth first out
//                                from the head, each [near, far] (near the head's side, where it grows from)
//   TIPS                         the measured tips of the four who have them
//   createConstellations(world, { capacity })  { group, add, set, starOf, pointsOf, linesOf, update, dispose }
//
// Places on the sky are { azimuth, elevation } in degrees (chapters/hatid-route.js SKY): azimuth from +X toward +Z (on the screen,
// a larger azimuth is to the right, wherever the camera looks), elevation up from the horizon.

const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const { clamp, smoothstep } = THREE.MathUtils;

export const STAR_BONE = 'Head';
const ROOT_BONE = 'root';
const SLOT = 40; // stars (and lines) a constellation may have: the models have 22 to 32 joints, the tips at most 4 more
const SIZE = { star: 0.34, head: 0.68 }; // degrees across at span 16 (they grow with the square root of the span)
const LIGHT = { star: 0.78, head: 1, line: 0.42 };
const BREATH = 0.35; // how much larger the stars are at breath 1
const TILT = 10; // degrees the view is lifted over her side: her far legs a little above her near ones, not on top of them
const TURN = 18; // and turned toward her front: her far legs a little ahead of her near ones

/**
 * The tips, each { name, bone, at: [x, y, z] in the bone's frame }: points on each model's own skin, measured on her standing in her
 * idle at its first frame (chapters/hatid-himinn.js measureTips: the skin's vertex the bone carries that reaches furthest the tip's
 * way), printed by ?chapter=hatid-himinn&measure=1 and pasted in here.
 */
export const TIPS = {
  sloedla: [{ name: 'crest', bone: 'Head', at: [-1.2005, 1.2765, 0.0001] }],
  uggedla: [
    { name: 'sail1', bone: 'Tail1', at: [0.7874, 3.2405, -0.0008] },
    { name: 'sail2', bone: 'Hips', at: [0.2662, 3.1786, 0.0307] },
    { name: 'sail3', bone: 'Chest', at: [-0.4774, 3.163, 0.0151] },
  ],
  kambedla: [
    { name: 'plate1', bone: 'Tail1', at: [-0.6367, 0.884, 0.0088] },
    { name: 'plate2', bone: 'Hips', at: [-0.1817, 1.8284, -0.0913] },
    { name: 'plate3', bone: 'Spine', at: [0.1239, 1.9425, 0.0117] },
    { name: 'plate4', bone: 'Chest', at: [0.4451, 1.1329, 0.2911] },
  ],
  flugedla: [{ name: 'crest', bone: 'Head', at: [-2.1486, 1.2242, 0.0531] }],
};

/** Every star's index (of `count`) but those in `away`. */
const headSide = (away, count) => { const out = new Set(away); return [...Array(count).keys()].filter(i => !out.has(i)); };

/** The skin's bones by name, and where each was in the bind pose, in the actor's root frame. */
function bindOf(actor) {
  const mesh = bodyMesh(actor);
  const bones = mesh.skeleton.bones;
  actor.root.updateMatrixWorld(true);
  // the bind's world to the root's frame: root⁻¹ · mesh.matrixWorld · bindMatrix⁻¹ (bindMatrix itself: an attached skin's
  // bindMatrixInverse follows the mesh's matrixWorld, not the bind); a bone's bind matrix is its inverse's inverse
  const toRoot = new THREE.Matrix4().copy(actor.root.matrixWorld).invert().multiply(mesh.matrixWorld).multiply(new THREE.Matrix4().copy(mesh.bindMatrix).invert());
  const m = new THREE.Matrix4();
  const bind = new Map();
  bones.forEach((bone, i) => {
    m.copy(mesh.skeleton.boneInverses[i]).invert().premultiply(toRoot);
    bind.set(bone.name, { bone, matrix: m.clone(), at: new THREE.Vector3().setFromMatrixPosition(m) });
  });
  return { bones, bind };
}

/**
 * Her stars and lines: a star on every bone of the skin but `root`, a line from every bone to its parent; a bone that hangs from the
 * root itself (the four legs of the four-legged, from their hips' and shoulders' height) is joined to the nearest star of those that
 * do not, as she stands in her bind pose (the root is no star). The tree's top is the bone the others come from (her Hips). A tip is
 * a star joined to its bone. `order` is every line breadth first out from STAR_BONE, each [near, far].
 */
export function skeletonLines(actor, { tips = [] } = {}) {
  const { bones, bind } = bindOf(actor);
  const skin = bones.filter(b => b.name !== ROOT_BONE);
  const names = new Set(skin.map(b => b.name));
  const joints = skin.map(b => b.name);
  const lines = [];
  const loose = [];
  for (const bone of skin) {
    const parent = bone.parent?.isBone ? bone.parent.name : null;
    if (parent && names.has(parent)) lines.push([bone.name, parent]);
    else loose.push(bone);
  }
  // the loose ones: the first of them (the one nearest the head's chain: her Hips) is the tree's top, the others join the nearest
  // star of the tree that is not loose
  const tied = skin.filter(b => !loose.includes(b));
  const top = loose.find(b => b.children.some(c => c.isBone && names.has(c.name) && !loose.includes(c))) ?? loose[0];
  for (const bone of loose) {
    if (bone === top) continue;
    const at = bind.get(bone.name).at;
    let best = null;
    let least = Infinity;
    for (const t of [top, ...tied]) {
      const d = bind.get(t.name).at.distanceToSquared(at);
      if (d < least) { least = d; best = t; }
    }
    lines.push([bone.name, best.name]);
  }
  for (const tip of tips) {
    if (!names.has(tip.bone)) throw new Error(`skeletonLines: no bone ${tip.bone} for the tip ${tip.name}`);
    joints.push(tip.name);
    lines.push([tip.name, tip.bone]);
  }
  // breadth first from the head
  const next = new Map(joints.map(n => [n, []]));
  for (const [a, b] of lines) { next.get(a).push(b); next.get(b).push(a); }
  const order = [];
  const seen = new Set([STAR_BONE]);
  const queue = [STAR_BONE];
  while (queue.length) {
    const near = queue.shift();
    for (const far of next.get(near) ?? []) {
      if (seen.has(far)) continue;
      seen.add(far);
      order.push([near, far]);
      queue.push(far);
    }
  }
  return { joints, lines, order };
}

// Points: as the night sky's (engine/night-sky.js), a soft round dot `aSize` across (the tangent of its angular diameter) in `aColor`.
const pointsVertex = /* glsl */`
attribute vec4 aColor;
attribute float aSize;
uniform float uHeight;
varying vec4 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float px = aSize * projectionMatrix[1][1] * uHeight * 0.5;
  gl_PointSize = max(px, 1.6) * 1.8;
  vColor = vec4(aColor.rgb, aColor.a * min(1.0, px / 1.6));
  if (!(aColor.a > 0.0)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const pointsFragment = /* glsl */`
varying vec4 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * (exp(-r * r * 7.0) * 0.8 + 0.2 * (1.0 - smoothstep(0.3, 0.5, r)));
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;
const linesVertex = /* glsl */`
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  if (!(aColor.a > 0.0)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const linesFragment = /* glsl */`
varying vec4 vColor;
void main() {
  if (vColor.a < 0.002) discard;
  gl_FragColor = vColor;
  #include <colorspace_fragment>
}`;
function material(key, vertexShader, fragmentShader, uniforms = {}) {
  return farPlaneDepth(new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }), key);
}

/**
 * Up to `capacity` constellations in `world.scene`.
 *   group        the THREE.Group 'Constellations', in world.scene
 *   add(key, actor, { colour, azimuth, elevation, span = 16, facing = 1, tips = [], tilt = TILT, turn = TURN })  hers (the same
 *                key again replaces hers): her bind pose's length covers `span` degrees of sky, her Head at (azimuth, elevation) in
 *                her bind pose; facing 1 her front to the right on the screen, -1 to the left (seen from her left side); the view of
 *                her side turned `turn` degrees toward her front and lifted `tilt` over it (her far legs beside her near ones, not
 *                on them). Nothing shows until set().
 *   set(key, { drawn = 1, level = 1, breath = 0, look = null })  drawn 0 to 1 draws her lines in `order`, a line at a time, each
 *                growing from the star's side, a star coming out as its line reaches it (the head's whenever level is over 0);
 *                level her light; breath 0 to 1 a swell of her stars' size; look { azimuth, elevation } turns her head's star and
 *                its neck's toward a place in the sky (her body stays)
 *   starOf(key)  her head's star now: { azimuth, elevation }
 *   pointsOf(key, out = [])  her stars now, each { name, azimuth, elevation, direction, light, size (degrees across) }
 *   linesOf(key) her lines in `order`, each { near, far, shown } (shown 0 to 1: how much of it is drawn)
 *   update(camera)  her pose this frame into the picture, hung from the camera: after the actors' update, before the render
 *   dispose()
 */
export function createConstellations(world, { capacity = 6 } = {}) {
  const group = new THREE.Group();
  group.name = 'Constellations';
  world.scene.add(group);
  const height = { value: 800 };
  const size = new THREE.Vector2();
  const measure = renderer => { height.value = renderer.getDrawingBufferSize(size).y || 800; };

  const geometry = (count, perItem) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * perItem * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * perItem * 4), 4));
    if (perItem === 1) g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
    return g;
  };
  const stars = new THREE.Points(geometry(capacity * SLOT, 1), material('constellation-stars-far', pointsVertex, pointsFragment, { uHeight: height }));
  stars.name = 'ConstellationStars';
  stars.renderOrder = -2.8; // over the night sky's stars (-3.5) and shooting stars (-3), under the sun's face (-2)
  stars.onBeforeRender = measure;
  const lines = new THREE.LineSegments(geometry(capacity * SLOT, 2), material('constellation-lines-far', linesVertex, linesFragment));
  lines.name = 'ConstellationLines';
  lines.renderOrder = -2.9;
  for (const o of [stars, lines]) { o.frustumCulled = false; o.visible = false; group.add(o); }

  const all = new Map(); // key -> her constellation
  const slots = Array(capacity).fill(null);

  const v = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  const m = new THREE.Matrix4();

  function add(key, actor, { colour = '#ffffff', azimuth = 0, elevation = 30, span = 16, facing = 1, tips = [], tilt = TILT, turn = TURN } = {}) {
    let slot = all.get(key)?.slot;
    if (slot === undefined) {
      slot = slots.indexOf(null);
      if (slot < 0) throw new Error(`createConstellations: room for ${capacity}, no more (${key})`);
    }
    const { joints, lines: pairs, order } = skeletonLines(actor, { tips });
    if (joints.length > SLOT) throw new Error(`createConstellations: ${key} has ${joints.length} stars, room for ${SLOT}`);
    const { bind } = bindOf(actor);
    const index = new Map(joints.map((n, i) => [n, i]));
    const source = joints.map(name => {
      const tip = tips.find(t => t.name === name);
      if (tip) return { bone: bind.get(tip.bone).bone, at: new THREE.Vector3(...tip.at), bind: new THREE.Vector3(...tip.at).applyMatrix4(bind.get(tip.bone).matrix) };
      return { bone: bind.get(name).bone, at: null, bind: bind.get(name).at.clone() };
    });
    const face = facing < 0 ? -1 : 1;
    const t = rad(tilt);
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    // her root's frame (x ahead, y up, z to her right) seen from her side: [right on the screen, up on it] in metres
    const cosY = Math.cos(rad(turn));
    const sinY = Math.sin(rad(turn));
    const view = (p, out) => {
      const near = face * p.z; // toward the lens: her right side seen from her right, her left from her left
      out[0] = face * (p.x * cosY - near * sinY);
      out[1] = p.y * cosT - (p.x * sinY + near * cosY) * sinT;
      return out;
    };
    const bindFlat = source.map(s => view(s.bind, [0, 0]));
    const head = index.get(STAR_BONE);
    const across = bindFlat.map(p => p[0]);
    const length = Math.max(...across) - Math.min(...across);
    const scale = span / Math.max(length, 1e-6); // degrees a metre
    const home = skyDirection(azimuth, elevation);
    const east = new THREE.Vector3(-Math.sin(rad(azimuth)), 0, Math.cos(rad(azimuth)));
    const north = new THREE.Vector3().crossVectors(east, home).normalize();
    const neck = index.get(source[head].bone.parent?.name);
    const neckBase = neck !== undefined ? index.get(source[neck].bone.parent?.name) : undefined;
    const children = new Map(joints.map(n => [n, []]));
    for (const [near, far] of order) children.get(near).push(far);
    const below = name => { const out = [index.get(name)]; for (const c of children.get(name)) out.push(...below(c)); return out; };
    const c = {
      key, actor, slot, joints, pairs, order, source, index, head, neck, neckBase,
      // what turns with the head about its neck, and with the neck about its base: the stars on the head's side of that bone (the
      // tree is the head's, so the side away from it is all that lies below the pivot)
      headTree: neck !== undefined ? headSide(below(joints[neck]), joints.length) : [],
      neckTree: neckBase !== undefined ? headSide(below(joints[neckBase]), joints.length) : [],
      bindHead: bindFlat[head], scale, home, east, north, view,
      colour: new THREE.Color(colour), starColour: new THREE.Color(colour).lerp(new THREE.Color('#ffffff'), 0.62),
      sizeScale: Math.sqrt(span / 16),
      state: { drawn: 1, level: 0, breath: 0, look: null },
      flat: joints.map(() => [0, 0]),
      dirs: joints.map(() => new THREE.Vector3()),
      shown: order.map(() => 0),
      light: joints.map(() => 0),
    };
    if (all.has(key)) clearSlot(all.get(key).slot);
    all.set(key, c);
    slots[slot] = key;
    refresh(c);
    return c;
  }

  /** Her pose now into c.flat (degrees right and up of `home`, look laid over) and c.dirs. */
  function pose(c) {
    const { actor, source, flat } = c;
    actor.root.updateMatrixWorld(true);
    inverse.copy(actor.root.matrixWorld).invert();
    const p = [0, 0];
    source.forEach((s, i) => {
      if (s.at) v.copy(s.at).applyMatrix4(m.multiplyMatrices(inverse, s.bone.matrixWorld));
      else v.setFromMatrixPosition(m.multiplyMatrices(inverse, s.bone.matrixWorld));
      c.view(v, p);
      flat[i][0] = (p[0] - c.bindHead[0]) * c.scale;
      flat[i][1] = (p[1] - c.bindHead[1]) * c.scale;
    });
    const look = c.state.look;
    if (look && c.neck !== undefined) {
      const target = toFlat(c, look);
      const turnAbout = (pivot, tree, angle) => {
        const [px, py] = flat[pivot];
        const cs = Math.cos(angle), sn = Math.sin(angle);
        for (const i of tree) {
          const x = flat[i][0] - px, y = flat[i][1] - py;
          flat[i][0] = px + x * cs - y * sn;
          flat[i][1] = py + x * sn + y * cs;
        }
      };
      const wayTo = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]);
      const half = a => Math.atan2(Math.sin(a), Math.cos(a)); // into -pi..pi
      // the neck takes half the turn about its own base, then the head the rest about the neck, pointing at the place
      if (c.neckBase !== undefined) {
        const base = flat[c.neckBase];
        turnAbout(c.neckBase, c.neckTree, 0.5 * half(wayTo(base, target) - wayTo(base, flat[c.head])));
      }
      const n = flat[c.neck];
      turnAbout(c.neck, c.headTree, half(wayTo(n, target) - wayTo(n, flat[c.head])));
    }
    flat.forEach((f, i) => toSky(c, f, c.dirs[i]));
  }
  const tmp = new THREE.Vector3();
  /** Degrees right and up of her home on the sky -> a direction (the tangent plane at home). */
  function toSky(c, [x, y], out) {
    return out.copy(c.home).addScaledVector(c.east, Math.tan(rad(x))).addScaledVector(c.north, Math.tan(rad(y))).normalize();
  }
  function toFlat(c, { azimuth, elevation }) {
    const d = skyDirection(azimuth, elevation, tmp);
    const h = d.dot(c.home);
    return [deg(Math.atan2(d.dot(c.east), h)), deg(Math.atan2(d.dot(c.north), h))];
  }

  /** What is drawn of her: her lines' share, her stars' light. */
  function lightUp(c) {
    const { drawn, level } = c.state;
    const count = c.order.length;
    c.light.fill(0);
    c.light[c.head] = level > 0 ? LIGHT.head * level : 0;
    c.order.forEach(([, far], i) => {
      const shown = level > 0 ? clamp(drawn * count - i, 0, 1) : 0;
      c.shown[i] = shown;
      c.light[c.index.get(far)] = LIGHT.star * level * smoothstep(shown, 0.7, 1);
    });
  }

  function clearSlot(slot) {
    const base = slot * SLOT;
    const sc = stars.geometry.getAttribute('aColor');
    const lc = lines.geometry.getAttribute('aColor');
    for (let i = 0; i < SLOT; i++) { sc.setW(base + i, 0); lc.setW(2 * (base + i), 0); lc.setW(2 * (base + i) + 1, 0); }
    sc.needsUpdate = lc.needsUpdate = true;
  }

  /** Her pose and light into the two buffers. */
  function write(c) {
    const base = c.slot * SLOT;
    const sp = stars.geometry.getAttribute('position');
    const sc = stars.geometry.getAttribute('aColor');
    const ss = stars.geometry.getAttribute('aSize');
    const lp = lines.geometry.getAttribute('position');
    const lc = lines.geometry.getAttribute('aColor');
    const swell = 1 + BREATH * clamp(c.state.breath, 0, 1);
    for (let i = 0; i < SLOT; i++) {
      if (i < c.joints.length) {
        const d = c.dirs[i];
        sp.setXYZ(base + i, d.x * DISTANCE, d.y * DISTANCE, d.z * DISTANCE);
        sc.setXYZW(base + i, c.starColour.r, c.starColour.g, c.starColour.b, c.light[i]);
        ss.setX(base + i, Math.tan(rad(sizeOf(c, i) * swell)));
      } else sc.setW(base + i, 0);
      const k = 2 * (base + i);
      if (i < c.order.length && c.shown[i] > 0) {
        const [near, far] = c.order[i];
        const a = c.dirs[c.index.get(near)];
        const b = c.dirs[c.index.get(far)];
        v.copy(a).lerp(b, c.shown[i]).normalize();
        lp.setXYZ(k, a.x * DISTANCE, a.y * DISTANCE, a.z * DISTANCE);
        lp.setXYZ(k + 1, v.x * DISTANCE, v.y * DISTANCE, v.z * DISTANCE);
        const alpha = LIGHT.line * c.state.level;
        lc.setXYZW(k, c.colour.r, c.colour.g, c.colour.b, alpha);
        lc.setXYZW(k + 1, c.colour.r, c.colour.g, c.colour.b, alpha);
      } else { lc.setW(k, 0); lc.setW(k + 1, 0); }
    }
    sp.needsUpdate = sc.needsUpdate = ss.needsUpdate = lp.needsUpdate = lc.needsUpdate = true;
  }
  const sizeOf = (c, i) => (i === c.head ? SIZE.head : SIZE.star) * c.sizeScale;

  function refresh(c) {
    pose(c);
    lightUp(c);
    write(c);
    let any = false;
    for (const o of all.values()) any ||= o.state.level > 0;
    stars.visible = lines.visible = any;
  }

  const get = key => {
    const c = all.get(key);
    if (!c) throw new Error(`createConstellations: no ${key}`);
    return c;
  };
  const place = d => ({ azimuth: deg(Math.atan2(d.z, d.x)), elevation: deg(Math.asin(clamp(d.y, -1, 1))) });

  return {
    group,
    add,
    set(key, { drawn = 1, level = 1, breath = 0, look = null } = {}) {
      const c = get(key);
      c.state = { drawn: clamp(Number(drawn) || 0, 0, 1), level: clamp(Number(level) || 0, 0, 1), breath: clamp(Number(breath) || 0, 0, 1), look };
      refresh(c);
    },
    starOf(key) {
      const c = get(key);
      pose(c);
      return place(c.dirs[c.head]);
    },
    pointsOf(key, out = []) {
      const c = get(key);
      pose(c);
      lightUp(c);
      out.length = 0;
      c.joints.forEach((name, i) => out.push({ name, ...place(c.dirs[i]), direction: c.dirs[i].clone(), light: c.light[i], size: sizeOf(c, i) }));
      return out;
    },
    linesOf(key) {
      const c = get(key);
      lightUp(c);
      return c.order.map(([near, far], i) => ({ near, far, shown: c.shown[i] }));
    },
    update(camera) {
      group.position.copy(camera.position);
      group.updateMatrixWorld();
      for (const c of all.values()) if (c.state.level > 0) { pose(c); lightUp(c); write(c); }
    },
    dispose() {
      world.scene.remove(group);
      for (const o of [stars, lines]) { o.geometry.dispose(); o.material.dispose(); }
      all.clear();
    },
  };
}
const DISTANCE = SKY_DISTANCE; // m from the camera, as the night sky (both at the far plane: the render order puts these over it)
