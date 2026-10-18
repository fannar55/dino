import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { BOARD } from './rules.js';
import { pickLook } from '../looks.js';
import { createLighting, sunDirection } from '../lighting.js';
import { installDepthShadows } from '../shadows.js';
import { installFog } from '../fog.js';
import { createSky } from '../sky.js';
import { createWind } from '../wind.js';
import { createEffects } from '../effects.js';
import { createPointResolver } from '../points.js';
import { createActor, updateActors } from '../actor.js';
import { updateCharacterLods, whenReady as characterLodsReady } from '../character-lod.js';
import { simplify } from '../simplify.js';
import { PRESETS } from '../quality.js';

// The valley of "Háls og hali" (spec sections 4 and 5), seen from the side like a side-scroller (the owner's choice, 2026-10-18):
// a long world running left to right, from the meadow through the forest and over the stream, up the hills to Þórseðla's nest on
// the mountaintop at the far right. The path of 50 numbered stone blocks runs along it in rising ledges (each square as high as
// the one before or higher), so every neck lifts you up and on to the right and every tail slides you down and back. The camera
// looks at the path from the side, a little above, and follows the pawn; the hills and the mountains behind move slower with
// their depth, and the plants in front pass before the path. A scene of its own, drawn by whatever renderer it is given (the
// game's, while the chapter waits behind the book, or the lab's).
//
//   const valley = await createValley(renderer, { board })
//   valley.squarePosition(n, out)   the middle of stone n's top, where a pawn stands (n 0: the meadow before stone 1)
//   valley.squareHeading(n)         which way the path runs at stone n (degrees, actor.js's: 0 is +X, the way on)
//   valley.progressOf(n)            how far along the path square n is, 0 (the start) to 1 (stone 50)
//   valley.neckAt(from), tailAt(from)   the Þórseðla of a neck or a tail (see thorsedlaOf below), or null
//   valley.camera                   a PerspectiveCamera with follow(target), frame(a, b), pan(), overview(), cut() and mode
//   valley.glow(n), setGlow(n, v)   stone n's numeral lights up (and fades), or is held at v (0..1)
//   valley.update(dt), render(), resize(w, h), dispose()
// and for the pawns and the game: world (actors, effects, heightAt, resolvePoint), scene, addUpdater(fn), registerThorsedla(actor),
// thorsedlas, pawns, puddleAt(from), nest, hostSpot(x, out), ready (resolves when every Þórseðla has its light levels), info.
//
// Sizes are metres. The pawns are small (Mosi about 2.4 m long on a 1.5 m block), the Þórseðlas about their real size: giants
// beside the pawns, light enough that ten of them stand in the tablet's budget (STYLE.md section 11): they share one model, draw
// a level of 1/2 to a welded 1,400 triangles of it by their size on screen, and cast the sun's shadow with the lightest.

const THORSEDLA_URL = new URL('../../assets/characters/brontosaurus.glb', import.meta.url).href;
const V3 = THREE.Vector3;
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const VALLEY = {
  stone: { step: 1.75, width: 1.5, height: 0.9, depth: 1.6 }, // centre to centre along the path; a block's size
  ledges: { per: 5, gap: 0.55, rises: [1.4, 1.9, 1.6, 2.3, 1.8, 2.1, 1.7, 2.6, 2.2] }, // stones a ledge, extra room at a riser, each rise (m)
  stream: { after: 18, width: 1.6 }, // the stream crosses the path after this square, the hop over it this much wider
  camera: { distance: 31, height: 7, lead: 3, fov: 38 },
  thorsedla: { neck: 0.95, tail: 1.05, vary: 0.04, behind: -2.7, turn: 12 }, // sizes against the real 22 m; z behind the path; degrees toward the camera
  look: 'morning', // the chapter's light (kafli1): the fog's shader chunk stays the same as the chapter's
  sun: { azimuth: 118, elevation: 46 }, // but the sun stands higher, behind the camera on the left: faces lit, short shadows
};

// The model's measures (brontosaurus.glb at its real size, facing +X, the root between the feet): the neck's base, how far ahead
// of it the head comes down in lowerHead, the tail's base and its tip, half the body's width over the feet, the bind diagonal.
const MODEL = { neckBase: [3.26, 4.01], bowReach: 4.13, bowHead: 7.39, tailBase: [-3.66, 4.21], tailTip: -13.6, chest: 2.24, hips: -2.18, halfWidth: 1.9, diagonal: 24.1 };

// ---------------------------------------------------------------------------------------------------------------------------
// The plan: where every stone stands, the ground's height along the way, the stream, the nest. Pure: no three.js scene.

export function planSide(board = BOARD) {
  const { step, width } = VALLEY.stone;
  const { per, gap, rises } = VALLEY.ledges;
  const count = board.size;
  const ledges = Math.ceil(count / per);
  const ledgeY = [0];
  for (let l = 1; l < ledges; l++) ledgeY.push(ledgeY[l - 1] + rises[(l - 1) % rises.length]);
  const squares = [];
  const spans = []; // each ledge's ground along x: [x0, x1, y]
  let x = 0;
  for (let n = 1; n <= count; n++) {
    const l = Math.floor((n - 1) / per);
    if (n > 1 && (n - 1) % per === 0) x += gap;
    if (n === VALLEY.stream.after + 1) x += VALLEY.stream.width;
    squares.push([x, ledgeY[l], 0]);
    if (!spans[l]) spans[l] = [x - step / 2, x, ledgeY[l]];
    spans[l][1] = x + step / 2;
    x += step;
  }
  const first = squares[0], last = squares[count - 1];
  const streamX = (squares[VALLEY.stream.after - 1][0] + squares[VALLEY.stream.after][0]) / 2;
  const nest = [last[0] + 5.2, last[1] + 2.4, -0.4];
  const peakX = nest[0];
  /** The ground's height along the path: the ledges with steep risers between, the meadow before, the mountaintop after. */
  function ground(x) {
    if (x <= spans[0][1]) return ledgeY[0];
    for (let l = 0; l < spans.length - 1; l++) {
      const [, e] = spans[l], [s] = spans[l + 1];
      if (x <= e) return spans[l][2];
      if (x < s) return spans[l][2] + (spans[l + 1][2] - spans[l][2]) * smoothstep(e - 0.05, s + 0.05, x);
    }
    const end = spans[spans.length - 1][1];
    if (x <= end) return spans[spans.length - 1][2];
    // the peak with the nest on it, then the far side of the mountain
    const y0 = spans[spans.length - 1][2];
    if (x <= peakX) return y0 + (nest[1] - y0) * smoothstep(end, peakX - 1.2, x);
    return nest[1] - 9 * smoothstep(peakX + 1.5, peakX + 22, x);
  }
  const startX = first[0] - width, endX = last[0] + width;
  return { squares, spans, ledgeY, ground, streamX, nest, gate: [first[0] - 3.4, 0], startX, endX, length: last[0] - first[0] };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Where each Þórseðla stands, in profile behind the path, facing on (right) and turned a little toward the camera:
//  - a neck's at its first stone, so her head comes down onto it (lowerHead brings her head MODEL.bowHead ahead of her root);
//    from there she lifts the pawn up toward the ledge of its last stone;
//  - a tail's on its first stone's ledge, the base of her tail over that stone and her tail sloping down and back toward the
//    last stone (the slide), its tip over the puddle the pawn splashes into.

export function placeProfile(plan, board = BOARD, { seed = 7 } = {}) {
  const { squares } = plan;
  const T = VALLEY.thorsedla;
  let s = seed >>> 0;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const placed = [];
  for (const [kind, pairs] of [['neck', board.necks], ['tail', board.tails]]) {
    for (const [from, to] of pairs) {
      const k = T[kind] * (1 + (random() * 2 - 1) * T.vary);
      const A = squares[from - 1], B = squares[to - 1];
      const heading = T.turn;
      const fx = Math.cos(rad(heading)), fz = Math.sin(rad(heading));
      let rx, rz;
      if (kind === 'neck') {
        rx = A[0] - fx * MODEL.bowHead * k;
        rz = T.behind - fz * MODEL.bowHead * k * 0.5;
      } else {
        rx = A[0] - fx * MODEL.tailBase[0] * k;
        rz = T.behind;
      }
      const at = d => [rx + fx * d * k, rz + fz * d * k];
      const tail0 = at(MODEL.tailBase[0]);
      let tail1 = at(MODEL.tailTip + 1);
      if (kind === 'tail') {
        const dx = B[0] - tail0[0], dz = B[2] - tail0[1], L = Math.hypot(dx, dz) || 1;
        const reach = Math.min(L - 1.2, (MODEL.tailBase[0] - MODEL.tailTip) * k * 0.95);
        tail1 = [tail0[0] + (dx / L) * reach, tail0[1] + (dz / L) * reach];
      }
      placed.push({ kind, from, to, scale: k, rx, rz, heading, turn: 0, E: 0, chest: at(MODEL.chest), hips: at(MODEL.hips), tail0, tail1, half: MODEL.halfWidth * k });
    }
  }
  return placed;
}


// ---------------------------------------------------------------------------------------------------------------------------
// Light levels for the Þórseðlas: the model's skin simplified to 1/2 ... 1/16 of its triangles once (in a worker), each level an
// index buffer over the same vertex buffers (engine/simplify.js), as character-lod.js does for the chapter's characters.

const COARSE = [3200, 1400]; // triangles of the two light levels (the welded skin's)
const LEVELS = [0.5, 0.25, ...COARSE];
const LEVEL_PX = [2000, 1000, 400, 140]; // the full skin above the first, a level below each (the bind diagonal's pixels)
const levelCache = new Map();
const TAIL_TIP_HEIGHT = 1.3; // metres: the tip of a tail's Þórseðla's tail over the ground (a pawn, Mosi with Egill, is under 1 m)

function simplifyInWorker(positions, index, options) {
  if (typeof Worker === 'undefined') return Promise.resolve(simplify(positions, index, options));
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../simplify-worker.js', import.meta.url), { type: 'module' });
    } catch {
      resolve(simplify(positions, index, options));
      return;
    }
    worker.onmessage = ({ data }) => { worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.levels); };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'simplify worker failed')); };
    worker.postMessage({ id: 1, positions, index, options }, [positions.buffer]);
  });
}

function skinArrays(geometry, count = geometry.attributes.position.count, pick = i => i) {
  const { skinIndex, skinWeight } = geometry.attributes;
  const indices = new Int32Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) for (let c = 0; c < 4; c++) { indices[i * 4 + c] = skinIndex.getComponent(pick(i), c); weights[i * 4 + c] = skinWeight.getComponent(pick(i), c); }
  return { indices, weights };
}

// The skin with its seams welded: one vertex for each place, so the simplifier may move every vertex and take the skin down to a
// few thousand triangles. A welded vertex cannot keep the texture coordinates of both sides of a seam, so the light levels carry
// the texture's colour at each vertex instead (colourFromMap) and draw with a material of their own, without the map.
function weldedSkin(geometry) {
  const position = geometry.attributes.position;
  const keyOf = i => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  const firstOf = new Map(), map = new Uint32Array(position.count), originals = [];
  for (let i = 0; i < position.count; i++) {
    const key = keyOf(i);
    if (!firstOf.has(key)) { firstOf.set(key, originals.length); originals.push(i); }
    map[i] = firstOf.get(key);
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize, out = new (attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array).constructor(originals.length * size);
    const raw = attribute.isInterleavedBufferAttribute
      ? (o, c) => attribute.data.array[o * attribute.data.stride + attribute.offset + c]
      : (o, c) => attribute.array[o * size + c];
    originals.forEach((o, i) => { for (let c = 0; c < size; c++) out[i * size + c] = raw(o, c); });
    g.setAttribute(name, new THREE.BufferAttribute(out, size, attribute.normalized));
  }
  const index = Uint32Array.from(geometry.index.array, i => map[i]);
  return { g, index, originals };
}

/** The colour map's colour under each vertex (linear), read from a small copy of its image. Null without a readable map. */
function colourFromMap(g, map) {
  const image = map?.image;
  if (!image || typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  try { c.drawImage(image, 0, 0, size, size); } catch { return null; }
  const pixels = c.getImageData(0, 0, size, size).data;
  const uv = g.attributes.uv, out = new Float32Array(uv.count * 3), colour = new THREE.Color();
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    if (map.flipY) v = 1 - v;
    const x = Math.min(size - 1, Math.max(0, Math.floor(u * size))), y = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
    const k = (y * size + x) * 4;
    colour.setRGB(pixels[k] / 255, pixels[k + 1] / 255, pixels[k + 2] / 255, THREE.SRGBColorSpace);
    out.set([colour.r, colour.g, colour.b], i * 3);
  }
  return new THREE.BufferAttribute(out, 3);
}

function lightLevels(geometry, map) {
  if (levelCache.has(geometry)) return levelCache.get(geometry);
  const position = geometry.attributes.position;
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) { positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i); }
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const diagonal = geometry.boundingBox.getSize(new V3()).length();
  const triangles = geometry.index.count / 3;
  const indexed = (attributesOf, corners, count) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(attributesOf.attributes)) g.setAttribute(name, attribute);
    g.setIndex(new THREE.BufferAttribute(count < 65536 ? Uint16Array.from(corners) : corners, 1));
    g.boundingBox = geometry.boundingBox;
    g.boundingSphere = geometry.boundingSphere;
    return g;
  };
  // the half and the quarter over the skin's own vertices, within the chapter's errors
  const fine = simplifyInWorker(positions, Uint32Array.from(geometry.index.array), {
    levels: [{ ratio: 0.5, maxError: 0.001 * diagonal }, { ratio: 0.25, maxError: 0.0025 * diagonal }],
    skin: skinArrays(geometry),
  }).then(levels => levels.map(({ corners }) => indexed(geometry, corners, position.count)));
  // the light ones over the welded skin
  const welded = weldedSkin(geometry);
  const colours = colourFromMap(welded.g, map);
  if (colours) welded.g.setAttribute('color', colours);
  const wp = welded.g.attributes.position;
  const coarse = simplifyInWorker(Float32Array.from(wp.array), welded.index, {
    levels: COARSE.map(t => ({ ratio: t / triangles, maxError: Infinity })),
    skin: skinArrays(geometry, welded.originals.length, i => welded.originals[i]),
  }).then(levels => levels.map(({ corners }) => indexed(welded.g, corners, wp.count)));
  const promise = Promise.all([fine, coarse]).then(([a, b]) => [geometry, ...a, ...b]);
  levelCache.set(geometry, promise);
  return promise;
}

const skinOf = model => { let mesh = null; model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; }); return mesh; };

// Turn a bone by a world-space rotation about its own pivot (as engine/actor.js does).
const parentQ = new THREE.Quaternion();
const localQ = new THREE.Quaternion();
function rotateBoneWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

/** The numerals 1..50 in one texture: red holds the numeral, green a star behind it (star squares), alpha all that is drawn. */
function drawNumerals(count, stars) {
  const cells = 8, cell = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cells * cell;
  const c = canvas.getContext('2d');
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  const star = (cx, cy, R, r) => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r : R;
      c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.closePath();
  };
  for (let n = 1; n <= count; n++) {
    const cx = ((n - 1) % cells) * cell + cell / 2, cy = Math.floor((n - 1) / cells) * cell + cell / 2;
    if (stars.has(n)) {
      c.fillStyle = 'rgb(0,255,0)';
      star(cx, cy + 2, 60, 27);
      c.fill();
    }
    const size = n < 10 ? 92 : 78;
    c.font = `900 ${size}px Nunito, "Arial Rounded MT Bold", sans-serif`;
    // the outline: alpha only (red 0), then the numeral: red
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = 15;
    c.strokeStyle = stars.has(n) ? 'rgb(0,255,0)' : 'rgb(0,0,0)';
    c.strokeText(String(n), cx, cy + 6);
    c.fillStyle = stars.has(n) ? 'rgb(255,255,0)' : 'rgb(255,0,0)';
    c.fillText(String(n), cx, cy + 6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return { texture, cells };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Small props, built in code: the fruit trees, the nest with its eggs, the stream and the puddles, the fireflies.

function colouredGeometry(geometry, colour) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(colour);
  const colours = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colours.length; i += 3) { colours[i] = c.r; colours[i + 1] = c.g; colours[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
  return g;
}

function fruitTree(random) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 2.2, 7);
  trunk.translate(0, 1.1, 0);
  parts.push(colouredGeometry(trunk, '#7a5a40'));
  const crown = [[0, 2.7, 0, 1.25], [0.6, 2.4, 0.3, 0.9], [-0.55, 2.45, -0.2, 0.95], [0.1, 3.2, -0.3, 0.85]];
  for (const [x, y, z, r] of crown) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.85, 1);
    g.translate(x, y, z);
    parts.push(colouredGeometry(g, random() < 0.5 ? '#5f9442' : '#6fa64a'));
  }
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI * 2, e = random() * 0.9 - 0.2;
    const g = new THREE.IcosahedronGeometry(0.17, 0);
    const [cx, cy, cz, cr] = crown[i % crown.length];
    g.translate(cx + Math.cos(a) * Math.cos(e) * cr * 0.98, cy + Math.sin(e) * cr * 0.85, cz + Math.sin(a) * Math.cos(e) * cr * 0.98);
    parts.push(colouredGeometry(g, i % 3 ? '#e2553a' : '#f2a33a'));
  }
  return mergeGeometries(parts);
}

function nestGeometry(random) {
  const parts = [];
  const bowl = new THREE.SphereGeometry(1.75, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.scale(1, 0.32, 1);
  bowl.translate(0, 0.42, 0);
  parts.push(colouredGeometry(bowl, '#8a6a46'));
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + random() * 0.2;
    const len = 1.3 + random() * 0.9;
    const g = new THREE.CylinderGeometry(0.06, 0.08, len, 5);
    g.rotateZ(Math.PI / 2);
    g.rotateY(-a + Math.PI / 2 + (random() - 0.5) * 0.7);
    g.rotateX((random() - 0.5) * 0.5);
    const r = 1.75 + random() * 0.35;
    g.translate(Math.cos(a) * r, 0.2 + random() * 0.55, Math.sin(a) * r);
    parts.push(colouredGeometry(g, ['#7a5a3c', '#946f48', '#6a4c33', '#a37c52'][i % 4]));
  }
  for (const [x, z, t] of [[-0.45, 0.2, 0.2], [0.42, 0.28, -0.25], [0, -0.42, 0.1]]) {
    const g = new THREE.SphereGeometry(0.34, 12, 9);
    g.scale(1, 1.32, 1);
    g.rotateZ(t);
    g.translate(x, 0.75, z);
    const coloured = colouredGeometry(g, '#f3ead6');
    // soft green spots, as the egg die has
    const p = coloured.attributes.position, col = coloured.attributes.color, v = new V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const s = Math.sin(v.x * 17 + x * 9) * Math.sin(v.y * 15) * Math.sin(v.z * 19 + z * 7);
      if (s > 0.35) col.setXYZ(i, 0.62, 0.78, 0.55);
    }
    parts.push(coloured);
  }
  return mergeGeometries(parts);
}

// The stream's water: a strip laid on the ground (ACROSS points across it, each on the ground), its edges fading into the grass.
const ACROSS = 5;
function ribbonGeometry(line, width, heightAt, above) {
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i];
    const [px, pz] = line[Math.max(0, i - 1)], [nx, nz] = line[Math.min(line.length - 1, i + 1)];
    const dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L, sz = dx / L;
    if (i) s += Math.hypot(x - line[i - 1][0], z - line[i - 1][1]);
    for (let k = 0; k < ACROSS; k++) {
      const v = k / (ACROSS - 1);
      const wx = x + sx * (v - 0.5) * width, wz = z + sz * (v - 0.5) * width;
      pos.push(wx, heightAt(wx, wz) + above, wz);
      uv.push(s, v);
    }
    if (i) for (let k = 0; k < ACROSS - 1; k++) { const a = (i - 1) * ACROSS + k, b = a + ACROSS; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const WATER_VERTEX = /* glsl */`
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FRAGMENT = /* glsl */`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uGlint;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float edge = abs(vUv.y - 0.5) * 2.0;
  float flow = sin(vUv.x * 1.3 - uTime * 1.2 + sin(vUv.y * 6.0 + vUv.x * 0.4) * 1.4) * 0.5 + 0.5;
  float ripple = sin(vUv.x * 2.7 - uTime * 2.1 + 3.0 * sin(vUv.y * 5.0 + vUv.x * 0.7)) * sin(vUv.x * 0.9 + vUv.y * 4.0 - uTime * 0.5);
  vec3 c = mix(uDeep, uShallow, smoothstep(0.35, 1.0, edge) * 0.8 + flow * 0.15);
  c += uGlint * 0.22 * smoothstep(0.8, 1.0, ripple * 0.5 + 0.5) * (1.0 - edge * 0.7);
  gl_FragColor = vec4(c, 0.88 * (1.0 - smoothstep(0.62, 1.0, edge)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#3f8fb0').convertSRGBToLinear() },
      uShallow: { value: new THREE.Color('#8fcbd2').convertSRGBToLinear() },
      uGlint: { value: new THREE.Color('#f4fbff').convertSRGBToLinear() },
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    fog: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
}

const FIREFLY_VERTEX = /* glsl */`
attribute vec4 aFly; // x phase, y speed, z radius of its wander, w size
uniform float uTime;
uniform float uPixels;
varying float vGlow;
#include <fog_pars_vertex>
void main() {
  float t = uTime * aFly.y + aFly.x * 6.2831;
  vec3 p = position + vec3(sin(t) * aFly.z, 0.35 * sin(t * 1.7 + aFly.x * 3.0), cos(t * 0.8) * aFly.z);
  vGlow = pow(0.5 + 0.5 * sin(uTime * (1.1 + aFly.y) + aFly.x * 40.0), 3.0);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = min(18.0, aFly.w * uPixels / -mvPosition.z) * (0.55 + 0.45 * vGlow);
  #include <fog_vertex>
}`;
const FIREFLY_FRAGMENT = /* glsl */`
uniform vec3 uColour;
varying float vGlow;
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float core = exp(-r * 9.0), halo = exp(-r * 2.6) * 0.45;
  gl_FragColor = vec4(uColour * (core * 2.4 + halo * 1.3) * (0.3 + 0.7 * vGlow), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------------------------------------------------------
// The stones: rounded blocks like big stepping stones, a numeral on the face toward the camera.

function stoneGeometry() {
  const { width: w, height: h, depth: d } = VALLEY.stone;
  const r = 0.16;
  const shape = new THREE.Shape();
  const x0 = -w / 2 + r, x1 = w / 2 - r, y0 = -h + r, y1 = -r;
  shape.moveTo(x0, -h);
  shape.lineTo(x1, -h);
  shape.quadraticCurveTo(w / 2, -h, w / 2, y0);
  shape.lineTo(w / 2, y1);
  shape.quadraticCurveTo(w / 2, 0, x1, 0);
  shape.lineTo(x0, 0);
  shape.quadraticCurveTo(-w / 2, 0, -w / 2, y1);
  shape.lineTo(-w / 2, y0);
  shape.quadraticCurveTo(-w / 2, -h, x0, -h);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(d - 0.16) / 2);
  // a little lumpy, so no two read as one cast shape
  const p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    p.setY(i, v.y + 0.03 * Math.sin(v.x * 5.1 + v.z * 3.3));
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------------
// The land: one long strip of ground (the ledges along the path, hills rising behind it, a bank falling toward the camera), the
// far hills and the mountains, and the plants, all built in code. Colours from the style guide's palette (STYLE.md section 4).

const LAND = {
  x: [-40, 0], // how far the ground reaches before the first stone and past the nest (added to the plan's ends)
  z: [-78, 16],
  cell: 1.0,
  colours: { meadow: '#a6b84a', forest: '#6f8f3c', hill: '#8fae47', rock: '#9b8f7b', rockDark: '#7a7062', path: '#c2a273', bank: '#86a43f' },
};

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}

/** The land's height: the plan's ground along the path, the hills behind it, the bank in front, the stream's bed. */
function landHeight(plan) {
  const bump = (x, z) => 0.22 * Math.sin(x * 0.37 + z * 0.21) * Math.sin(z * 0.41 - x * 0.13) + 0.12 * Math.sin(x * 1.1 + z * 0.9);
  return (x, z) => {
    let h = plan.ground(x);
    const behind = smoothstep(-3.2, -46, z);
    h += behind * (8 + 5 * Math.sin(x * 0.043 + 1.2) + 3 * Math.sin(x * 0.11)) + smoothstep(-40, -78, z) * (10 + 6 * Math.sin(x * 0.03));
    h -= smoothstep(2.4, 15, z) * 1.6;
    h += bump(x, z) * smoothstep(1.6, 4, Math.abs(z));
    const d = Math.abs(x - plan.streamX);
    if (d < 2.2) h -= 0.9 * (1 - smoothstep(0.5, 2.2, d)) * smoothstep(-30, -2, z) * (1 - smoothstep(10, 16, z) * 0.3);
    return h;
  };
}

function buildGround(plan, heightAt) {
  const [xa, xb] = [plan.startX + LAND.x[0], plan.nest[0] + 40];
  const [za, zb] = LAND.z;
  const nx = Math.ceil((xb - xa) / LAND.cell), nz = Math.ceil((zb - za) / LAND.cell);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const C = Object.fromEntries(Object.entries(LAND.colours).map(([k, v]) => [k, new THREE.Color(v)]));
  const forestFrom = plan.squares[5][0], forestTo = plan.squares[16][0], rockFrom = plan.squares[34][0];
  const c = new THREE.Color();
  for (let j = 0; j <= nz; j++) {
    // rows close to the path are finer in z: the risers and the stream want them
    const z = za + j * ((zb - za) / nz);
    for (let i = 0; i <= nx; i++) {
      const x = xa + i * ((xb - xa) / nx);
      const y = heightAt(x, z);
      const k = (j * (nx + 1) + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const slope = Math.abs(heightAt(x + 0.5, z) - heightAt(x - 0.5, z)) + Math.abs(heightAt(x, z + 0.5) - heightAt(x, z - 0.5));
      const forest = smoothstep(forestFrom - 6, forestFrom, x) * (1 - smoothstep(forestTo, forestTo + 6, x));
      const rocky = smoothstep(rockFrom - 4, rockFrom + 12, x);
      c.copy(C.meadow).lerp(C.hill, smoothstep(forestTo, forestTo + 12, x)).lerp(C.forest, forest * 0.85);
      c.lerp(C.rock, rocky * (0.35 + 0.4 * smoothstep(-2, -20, z)));
      c.lerp(C.rockDark, smoothstep(0.55, 1.1, slope));
      c.lerp(C.path, (1 - smoothstep(0.9, 1.6, Math.abs(z))) * 0.75 * (x > plan.startX - 4 ? 1 : 0.5));
      c.lerp(C.bank, smoothstep(3, 9, z) * 0.4);
      c.offsetHSL(0, 0, 0.025 * Math.sin(x * 1.7 + z * 2.3));
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'Ground';
  mesh.receiveShadow = true;
  return mesh;
}

/** The mountains far behind: a jagged ridge, blue-grey with snow on the peaks; the fog melts it into the sky. */
function buildMountains(plan, random) {
  const pos = [], col = [], idx = [];
  const rock = new THREE.Color('#7d8fa3'), snow = new THREE.Color('#f2f4f6'), c = new THREE.Color();
  const z = -190, x0 = plan.startX - 160, x1 = plan.nest[0] + 160;
  let x = x0, k = 0;
  while (x <= x1) {
    const peak = 40 + 45 * Math.abs(Math.sin(x * 0.012 + 0.7)) * (0.6 + 0.4 * random()) + (x > plan.nest[0] - 40 ? 25 : 0);
    pos.push(x, -10, z, x, peak, z);
    c.copy(rock);
    col.push(c.r, c.g, c.b);
    c.copy(rock).lerp(snow, peak > 62 ? 0.9 : 0.35);
    col.push(c.r, c.g, c.b);
    if (k) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    x += 14 + random() * 10;
    k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  mesh.name = 'Mountains';
  return mesh;
}

// The plants: round broadleaf trees and tall conifers, bushes, ferns and flowers, each a few simple shapes in vertex colours,
// merged into two meshes (those near the path cast shadows, those far do not).
function blob(parts, x, y, z, r, colour, squash = 0.85) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  parts.push(colouredGeometry(g, colour));
}
function broadleaf(parts, x, y, z, size, random) {
  const trunk = new THREE.CylinderGeometry(0.12 * size, 0.2 * size, 2.6 * size, 6);
  trunk.translate(x, y + 1.3 * size, z);
  parts.push(colouredGeometry(trunk, '#6e5440'));
  const greens = ['#3f6c4c', '#4f7e45', '#5f9442', '#7fa64c'];
  for (let i = 0; i < 4; i++) {
    const a = random() * Math.PI * 2, rr = (i ? 0.75 : 0) * size;
    blob(parts, x + Math.cos(a) * rr, y + (3.0 + random() * 0.9) * size, z + Math.sin(a) * rr * 0.6, (1.05 + random() * 0.4) * size, greens[Math.floor(random() * greens.length)]);
  }
}
function conifer(parts, x, y, z, size, random) {
  const trunk = new THREE.CylinderGeometry(0.1 * size, 0.18 * size, 1.4 * size, 6);
  trunk.translate(x, y + 0.7 * size, z);
  parts.push(colouredGeometry(trunk, '#5d4636'));
  for (let i = 0; i < 3; i++) {
    const g = new THREE.ConeGeometry((1.5 - i * 0.38) * size, 2.2 * size, 7);
    g.translate(x, y + (1.9 + i * 1.25) * size, z);
    parts.push(colouredGeometry(g, i % 2 ? '#3a5f4b' : '#2c4f45'));
  }
  void random;
}
function bush(parts, x, y, z, size, random) {
  const n = 1 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) blob(parts, x + (random() - 0.5) * size, y + 0.45 * size, z + (random() - 0.5) * size * 0.6, (0.55 + random() * 0.3) * size, random() < 0.5 ? '#557a3a' : '#6a9142', 0.75);
}
function fern(parts, x, y, z, size, random) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + random() * 0.4;
    const g = new THREE.ConeGeometry(0.11 * size, 1.15 * size, 3);
    g.translate(0, 0.55 * size, 0);
    g.rotateZ(-0.95);
    g.rotateY(a);
    g.translate(x, y, z);
    parts.push(colouredGeometry(g, i % 2 ? '#5f8f3e' : '#6f9e46'));
  }
}
function flower(parts, x, y, z, random) {
  const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.45, 3);
  stem.translate(x, y + 0.22, z);
  parts.push(colouredGeometry(stem, '#5f8f3e'));
  const g = new THREE.IcosahedronGeometry(0.09, 0);
  g.translate(x, y + 0.47, z);
  parts.push(colouredGeometry(g, ['#f2c443', '#ef8a5a', '#f0a3b6', '#f6f1e4', '#9c83d4'][Math.floor(random() * 5)]));
}

function buildPlants(plan, heightAt, places, random) {
  const near = [], far = [];
  const forestFrom = plan.squares[5][0], forestTo = plan.squares[16][0], rockFrom = plan.squares[34][0];
  const x0 = plan.startX - 30, x1 = plan.nest[0] + 30;
  // nothing tall where a Þórseðla stands, nor right on the path
  const clearOf = (x, z, r) => places.every(p => {
    const ax = Math.min(p.chest[0], p.tail1[0], p.tail0[0]) - 1.5, bx = Math.max(p.chest[0], p.tail1[0], p.tail0[0]) + 1.5;
    return x < ax - r || x > bx + r || z < p.rz - 3.5 - r || z > p.rz + 3 + r;
  });
  const nearNest = (x, z) => Math.hypot(x - plan.nest[0], z - plan.nest[2]) < 4;
  const inStream = x => Math.abs(x - plan.streamX) < 1.6;
  for (let x = x0; x < x1; x += 1.1) {
    const forest = smoothstep(forestFrom - 6, forestFrom, x) * (1 - smoothstep(forestTo, forestTo + 6, x));
    const rocky = smoothstep(rockFrom - 4, rockFrom + 10, x);
    // behind the path: trees, thick in the forest, conifers up the mountain
    for (let row = 0; row < 3; row++) {
      if (random() > 0.08 + forest * 0.55 + 0.04 * row) continue;
      const z = -6 - row * 7 - random() * 6;
      if (!clearOf(x, z, 2) || nearNest(x, z) || inStream(x)) continue;
      const y = heightAt(x, z);
      const list = row === 0 ? near : far;
      if (rocky > 0.5 || (row > 0 && random() < 0.3)) conifer(list, x, y, z, 1.1 + random() * 0.8, random);
      else broadleaf(list, x, y, z, 1.0 + random() * 0.6 + forest * 0.3, random);
    }
    // bushes and ferns at the back of the path and in front of it
    if (random() < 0.45 + forest * 0.3) {
      const z = -2.2 - random() * 3;
      if (clearOf(x, z, 0.5) && !nearNest(x, z) && !inStream(x)) (random() < 0.5 ? fern : bush)(near, x, heightAt(x, z), z, 0.8 + random() * 0.5, random);
    }
    if (random() < 0.5) {
      const z = 2.6 + random() * 6;
      if (!inStream(x)) (random() < 0.55 ? fern : bush)(near, x, heightAt(x, z), z, 0.9 + random() * 0.7, random);
    }
    // flowers in the meadow and along the way
    const meadow = 1 - smoothstep(forestFrom - 8, forestFrom, x) + 0.3;
    for (let f = 0; f < 3; f++) {
      if (random() > 0.35 * meadow * (1 - rocky * 0.7)) continue;
      const z = (random() < 0.5 ? 1 : -1) * (1.7 + random() * 4);
      if (!inStream(x)) flower(near, x + random(), heightAt(x, z), z, random);
    }
  }
  return { near: mergeGeometries(near), far: mergeGeometries(far) };
}


// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The valley. `renderer` draws it (and builds its sky light); `board` is rules.js's BOARD (or one of the same shape); `q` a quality
 * preset (engine/quality.js, tablet by default). Resolves once the land, the stones and the Þórseðlas are in the scene;
 * `valley.ready` resolves once their light levels are in place too.
 */
export async function createValley(renderer, { board = BOARD, q = PRESETS.tablet, params = new URLSearchParams(), win = globalThis.window } = {}) {
  const chapterLook = pickLook(VALLEY.look);
  const look = { ...chapterLook, sun: { ...chapterLook.sun, ...VALLEY.sun } };
  const scene = new THREE.Scene();
  scene.name = 'Háls og hali';
  const camera = new THREE.PerspectiveCamera(VALLEY.camera.fov, 16 / 10, 0.3, 1400);
  camera.name = 'Valley camera';
  scene.add(camera); // the egg die rides in front of it
  const lighting = createLighting(scene, look, q);
  lighting.sun.name = 'Valley sun';
  installDepthShadows(renderer, lighting.sun);
  installFog(scene, chapterLook, sunDirection(chapterLook));
  scene.fog.density *= 0.55; // the side view looks far: the hills stay, the mountains go hazy
  const sky = createSky({ renderer, scene, look, sunDir: lighting.direction });
  const wind = createWind();
  const plan = planSide(board);
  const places = placeProfile(plan, board);
  const heightAt = landHeight(plan);

  let time = 0;
  const world = {
    THREE, renderer, scene, camera, q, params, look, lighting, wind,
    chapter: { look: VALLEY.look, actors: {}, shots: {} },
    heightAt,
    actors: new Map(),
    effects: createEffects(),
    clock: { get time() { return time; } },
  };
  world.resolvePoint = createPointResolver(world);

  // ---- the land --------------------------------------------------------------------------------------------------------
  const ground = buildGround(plan, heightAt);
  const mountains = buildMountains(plan, makeRandom(17));
  const plantsMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const plantGeometry = buildPlants(plan, heightAt, places, makeRandom(29));
  const plantsNear = new THREE.Mesh(plantGeometry.near, plantsMaterial);
  plantsNear.name = 'Plants near';
  plantsNear.castShadow = true;
  plantsNear.receiveShadow = true;
  const plantsFar = new THREE.Mesh(plantGeometry.far, plantsMaterial);
  plantsFar.name = 'Plants far';
  const land = new THREE.Group();
  land.name = 'Land';
  land.add(ground, mountains, plantsNear, plantsFar);
  scene.add(land);

  // ---- stones ----------------------------------------------------------------------------------------------------------
  const count = board.size;
  const stars = new Set(board.stars ?? []);
  const fruit = new Set(board.fruit ?? []);
  const squares = plan.squares.map(([x, y, z]) => new V3(x, y, z));
  const stoneTop = VALLEY.stone.height;
  const stoneMaterial = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, envMapIntensity: 0.4 });
  const stones = new THREE.InstancedMesh(stoneGeometry(), stoneMaterial, count);
  stones.name = 'Stones';
  stones.castShadow = true;
  stones.receiveShadow = true;
  const stoneColours = [];
  {
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new V3();
    const random = makeRandom(99);
    const base = [new THREE.Color('#d6b98a'), new THREE.Color('#cbb087'), new THREE.Color('#dcc193'), new THREE.Color('#c4aa86')];
    squares.forEach((p, i) => {
      qn.setFromAxisAngle(new V3(0, 1, 0), (random() - 0.5) * 0.08);
      sc.set(0.97 + random() * 0.06, 1, 1);
      m.compose(new V3(p.x, p.y + stoneTop, p.z), qn, sc);
      stones.setMatrixAt(i, m);
      const c = base[i % base.length].clone().offsetHSL(0, 0, (random() - 0.5) * 0.05);
      stoneColours.push(c);
      stones.setColorAt(i, c);
    });
  }
  scene.add(stones);

  // the numerals: on each block's face toward the camera
  const fontsReady = win?.document?.fonts?.load?.('900 92px Nunito').catch(() => null);
  await Promise.race([fontsReady, new Promise(resolve => setTimeout(resolve, 1500))]);
  const numerals = drawNumerals(count, stars);
  const numeralGeometry = new THREE.PlaneGeometry(0.92, 0.92);
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  glowAttr.setUsage(THREE.DynamicDrawUsage);
  for (let n = 1; n <= count; n++) cellAttr.setXY(n - 1, ((n - 1) % numerals.cells) / numerals.cells, 1 - (Math.floor((n - 1) / numerals.cells) + 1) / numerals.cells);
  numeralGeometry.setAttribute('aCell', cellAttr);
  numeralGeometry.setAttribute('aGlow', glowAttr);
  const numeralMaterial = new THREE.MeshBasicMaterial({ map: numerals.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  numeralMaterial.onBeforeCompile = shader => {
    shader.uniforms.uCellSize = { value: 1 / numerals.cells };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nattribute float aGlow;\nvarying float vGlow;\nuniform float uCellSize;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * uCellSize + aCell;\n#endif\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <map_fragment>', `
        vec4 cellTexel = texture2D( map, vMapUv );
        vec3 outline = mix( vec3( 0.96, 0.92, 0.82 ), vec3( 0.98, 0.84, 0.36 ), cellTexel.g );
        vec3 ink = mix( vec3( 0.20, 0.13, 0.08 ), vec3( 1.0, 0.86, 0.32 ), vGlow );
        vec3 starInk = mix( vec3( 0.36, 0.22, 0.06 ), vec3( 1.0, 0.95, 0.7 ), vGlow );
        vec3 numeralColour = mix( ink, starInk, step( 0.5, cellTexel.g ) * step( 0.5, cellTexel.r ) );
        diffuseColor.rgb = mix( outline, numeralColour, step( 0.5, cellTexel.r ) );
        diffuseColor.rgb = sRGBTransferEOTF( vec4( diffuseColor.rgb, 1.0 ) ).rgb * ( 1.0 + vGlow * 0.8 );
        diffuseColor.a *= cellTexel.a;`);
  };
  const numeralsMesh = new THREE.InstancedMesh(numeralGeometry, numeralMaterial, count);
  numeralsMesh.name = 'Numerals';
  numeralsMesh.renderOrder = 3;
  {
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion();
    squares.forEach((p, i) => {
      m.compose(new V3(p.x, p.y + stoneTop * 0.5, p.z + VALLEY.stone.depth / 2 + 0.005), qn, new V3(1, 1, 1));
      numeralsMesh.setMatrixAt(i, m);
    });
  }
  scene.add(numeralsMesh);
  // a soft halo of light behind a numeral that glows
  const ringGeometry = new THREE.PlaneGeometry(2.2, 2.2);
  ringGeometry.setAttribute('aGlow', glowAttr);
  const ringMaterial = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color('#ffd76a').convertSRGBToLinear() } },
    vertexShader: 'attribute float aGlow; varying float vGlow; varying vec2 vUv; void main() { vGlow = aGlow; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColour; varying float vGlow; varying vec2 vUv; void main() { float r = length(vUv - 0.5) * 2.0; float halo = exp(-r * r * 3.5) * (1.0 - smoothstep(0.8, 1.0, r)); if (vGlow < 0.01) discard; gl_FragColor = vec4(uColour * halo * vGlow * 1.2, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, count);
  rings.name = 'Stone glow';
  rings.instanceMatrix = numeralsMesh.instanceMatrix;
  rings.renderOrder = 4;
  rings.frustumCulled = false;
  scene.add(rings);
  const glow = new Float32Array(count); // now
  const glowHeld = new Float32Array(count); // what it rests at
  let glowDirty = true;

  // ---- fruit trees, the nest, the stream, the puddles ------------------------------------------------------------------
  const propsMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const propParts = [];
  {
    const random = makeRandom(5);
    for (const n of fruit) {
      const p = squares[n - 1];
      const g = fruitTree(random);
      g.rotateY(random() * Math.PI * 2);
      const x = p.x - 0.6, z = -2.2;
      g.translate(x, heightAt(x, z) - 0.05, z);
      propParts.push(g);
    }
    const nest = nestGeometry(random);
    nest.translate(plan.nest[0], heightAt(plan.nest[0], plan.nest[2]) - 0.1, plan.nest[2]);
    propParts.push(nest);
  }
  const props = new THREE.Mesh(mergeGeometries(propParts), propsMaterial);
  props.name = 'Fruit trees and nest';
  props.castShadow = true;
  props.receiveShadow = true;
  scene.add(props);

  const water = waterMaterial();
  const streamLine = [];
  for (let z = LAND.z[0] + 30; z <= LAND.z[1]; z += 1) streamLine.push([plan.streamX + 0.5 * Math.sin(z * 0.3), z]);
  const stream = new THREE.Mesh(ribbonGeometry(streamLine, 2.2, heightAt, 0.32), water);
  stream.renderOrder = 2;
  stream.name = 'Stream';
  scene.add(stream);
  // a puddle in front of each tail's last stone: the splash at the bottom of the slide
  const puddles = new Map();
  const puddleGeometry = new THREE.CircleGeometry(1, 20);
  puddleGeometry.rotateX(-Math.PI / 2);
  puddleGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: puddleGeometry.attributes.position.count }, (_, i) => {
    const x = puddleGeometry.attributes.position.getX(i), z = puddleGeometry.attributes.position.getZ(i);
    return [x * 3, 0.5 + Math.hypot(x, z) * 0.5];
  }).flat(), 2));
  const puddleMesh = new THREE.InstancedMesh(puddleGeometry, water, board.tails.length);
  puddleMesh.name = 'Puddles';
  places.filter(p => p.kind === 'tail').forEach((p, i) => {
    const B = squares[p.to - 1];
    const at = new V3(B.x + 1.6, 0, 1.7);
    at.y = heightAt(at.x, at.z) + 0.04;
    puddleMesh.setMatrixAt(i, new THREE.Matrix4().compose(at, new THREE.Quaternion(), new V3(1.2, 1, 0.75)));
    puddles.set(p.from, at);
  });
  scene.add(puddleMesh);

  // ---- fireflies -------------------------------------------------------------------------------------------------------
  const flyCount = q.name === 'low' ? 40 : 90;
  const flyPositions = new Float32Array(flyCount * 3), flyData = new Float32Array(flyCount * 4);
  {
    const random = makeRandom(41);
    const forestFrom = plan.squares[5][0], forestTo = plan.squares[16][0];
    for (let i = 0; i < flyCount; i++) {
      let x, z;
      if (i % 3 === 0) { x = plan.streamX + (random() - 0.5) * 3; z = -10 + random() * 18; } // over the stream
      else if (i % 3 === 1) { x = forestFrom + random() * (forestTo - forestFrom); z = -9 + random() * 7; } // in the forest's shade
      else { x = plan.startX + random() * (plan.nest[0] - plan.startX); z = -7 + random() * 4; } // all along, behind the path
      flyPositions.set([x, heightAt(x, z) + 0.6 + random() * 2.4, z], i * 3);
      flyData.set([random(), 0.35 + random() * 0.5, 0.4 + random() * 1.1, 0.3 + random() * 0.16], i * 4);
    }
  }
  const flyGeometry = new THREE.BufferGeometry();
  flyGeometry.setAttribute('position', new THREE.BufferAttribute(flyPositions, 3));
  flyGeometry.setAttribute('aFly', new THREE.BufferAttribute(flyData, 4));
  const flyMaterial = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: { value: 0 }, uPixels: { value: 800 }, uColour: { value: new THREE.Color('#f6ff9a').convertSRGBToLinear() } },
    vertexShader: FIREFLY_VERTEX,
    fragmentShader: FIREFLY_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  const fireflies = new THREE.Points(flyGeometry, flyMaterial);
  fireflies.name = 'Fireflies';
  fireflies.frustumCulled = false;
  fireflies.renderOrder = 6;
  scene.add(fireflies);


  // ---- the Þórseðlas ---------------------------------------------------------------------------------------------------
  // Each is the chapter's own actor (engine/actor.js: idle breathing, footing, eyelids, look). The board's stand still in idle,
  // each a little out of step with the others, and look at the nearest pawn when one comes near.
  const thorsedlaWorld = Object.create(world); // no character-lod levels for them (no renderer): the valley gives them lighter ones
  thorsedlaWorld.renderer = null;
  const light = []; // { actor, mesh, levels, level, caster }
  const sun = lighting.sun;
  const casters = new Set();
  const casterMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const coarseMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }); // the light levels'
  casterMaterial.shadowSide = THREE.FrontSide;
  if (sun.castShadow) {
    const before = sun.shadow.updateMatrices;
    sun.shadow.updateMatrices = function valleyShadowPass(l, viewport) {
      before.call(this, l, viewport);
      if (l === sun) for (const c of casters) c.visible = c.userData.owner.visible;
    };
  }
  let levelsReady = null;
  let firstLevels = null; // the model's light levels (every Þórseðla shares them)
  function registerThorsedla(actor) {
    const mesh = skinOf(actor.model);
    const entry = { actor, mesh, levels: null, level: 0, caster: null };
    light.push(entry);
    entry.material = mesh.material;
    const levelsPromise = lightLevels(mesh.geometry, mesh.material.map);
    firstLevels ??= levelsPromise;
    const ready = levelsPromise.then(levels => {
      if (levels[levels.length - 1].attributes.color) entry.coarseMaterial = coarseMaterial;
      entry.levels = levels;
      if (sun.castShadow) {
        const caster = new THREE.SkinnedMesh(levels[levels.length - 1], casterMaterial);
        caster.name = `${actor.name} shadow`;
        caster.bindMode = mesh.bindMode;
        caster.bind(mesh.skeleton, mesh.bindMatrix);
        caster.castShadow = true;
        caster.receiveShadow = false;
        caster.frustumCulled = false;
        caster.visible = false;
        caster.userData.owner = actor.root;
        caster.onAfterShadow = () => { caster.visible = false; };
        mesh.add(caster);
        casters.add(caster);
        entry.caster = caster;
        mesh.castShadow = false;
      }
      setLevel(entry, LEVELS.length); // the lightest until the first frame picks
    }).catch(error => console.warn('[valley] a Þórseðla keeps her full skin:', error.message));
    levelsReady = Promise.all([levelsReady, ready]);
    return ready;
  }
  function setLevel(entry, level) {
    if (!entry.levels || level === entry.level) return;
    entry.level = level;
    entry.mesh.geometry = entry.levels[level];
    entry.mesh.material = level >= 3 && entry.coarseMaterial ? entry.coarseMaterial : entry.material;
  }
  const camPos = new V3(), centre = new V3(), frustum = new THREE.Frustum(), vp = new THREE.Matrix4(), sphere = new THREE.Sphere();
  function updateLevels(height) {
    camera.updateMatrixWorld();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const pxPerUnit = height / (2 * Math.tan(rad(camera.fov) / 2));
    for (const e of light) {
      if (!e.levels) continue;
      e.actor.centre(centre);
      const k = e.actor.root.scale.x;
      const inView = frustum.intersectsSphere(sphere.set(centre, (MODEL.diagonal / 2) * k * 1.3));
      const px = inView ? (MODEL.diagonal * k * pxPerUnit) / Math.max(0.1, camPos.distanceTo(centre)) : 0;
      let level = 0;
      while (level < LEVEL_PX.length && px < LEVEL_PX[level]) level++;
      setLevel(e, level);
    }
  }

  const thorsedlas = [];
  const byNeck = new Map(), byTail = new Map();
  for (const [i, p] of places.entries()) {
    const actor = await createActor(thorsedlaWorld, { name: `thorsedla-${p.kind}-${p.from}`, url: THORSEDLA_URL, position: [p.rx, 0, p.rz], heading: p.heading });
    actor.root.scale.setScalar(p.scale);
    actor.place(p.rx, p.rz, p.heading);
    // out of step: each starts her idle somewhere else in its six seconds, a little faster or slower
    const idle = actor.mixer.existingAction(actor.clips.get('idle'));
    if (idle) { idle.time = (i * 1.37) % 6; idle.setEffectiveTimeScale(0.9 + (i % 4) * 0.06); }
    registerThorsedla(actor);
    const t = thorsedlaOf(actor, p);
    thorsedlas.push(t);
    (p.kind === 'neck' ? byNeck : byTail).set(p.from, t);
  }

  /**
   * One Þórseðla of the board, ready to be moved by the game:
   *   kind, from, to, actor (engine/actor.js), root, scale
   *   headPoint(out)          where a pawn rides on her head (on top of it), as she stands now
   *   bow({ duration })        her head comes down onto her first stone (lowerHead, her neck turned toward it): a Promise
   *   lift({ duration })       from there up to her full height (liftUp): a Promise
   *   reach(point, { duration })  her neck turns toward a point (null: straight again): she leans to put a pawn down there
   *   rest({ fade })           back to her idle
   *   happy()                  a happy rock and stamp (her happy clip), then idle again
   *   slideCurve()             a tail's: a curve over her back and down her tail to its tip, as she stands now
   *   tailTip(out)             a tail's: the tip of her tail
   *   puddle                   a tail's: the puddle the slide ends in (a point on the ground)
   *   watch(on)                whether she looks at the pawns near her (on by default)
   */
  function thorsedlaOf(actor, p) {
    const model = actor.model;
    const head = model.getObjectByName('Head');
    const neckBones = ['Neck', 'Neck2', 'Neck3', 'Neck4', 'Neck5'].map(n => model.getObjectByName(n)).filter(Boolean);
    const tailBones = [];
    model.traverse(o => { if (o.isBone && /^Tail\d+$/.test(o.name)) tailBones.push(o); });
    tailBones.sort((a, b) => Number(a.name.slice(4)) - Number(b.name.slice(4)));
    const layerBones = [...neckBones, ...tailBones];
    const saved = layerBones.map(b => b.quaternion.clone());
    let layered = false;
    // the neck's turn (radians about the vertical), easing toward its goal
    let yaw = 0, yawGoal = 0, yawEase = 0.6;
    // a tail's own bend toward its last stone: offsets on each tail bone, solved once below
    let tailBend = null;
    const up = new V3(0, 1, 0);
    const qv = new THREE.Quaternion();
    const timers = [];
    let clock = 0;
    let watching = true;
    let looking = false;
    const lookPoint = new V3(), lookLift = new V3(0, 0.6, 0);
    let busyUntil = 0;
    const later = (seconds, fn) => new Promise(resolve => timers.push({ at: clock + seconds, fn: () => { fn?.(); resolve(); } }));

    function yawToward(point) {
      const nb = new V3(...[MODEL.neckBase[0], 0, 0]).applyMatrix4(actor.root.matrixWorld);
      const dir = Math.atan2(point.z - nb.z, point.x - nb.x);
      const facing = -actor.root.rotation.y;
      let d = Math.atan2(Math.sin(dir - facing), Math.cos(dir - facing));
      d = Math.max(-rad(110), Math.min(rad(110), d));
      return -d; // a turn about +Y toward +Z is negative
    }
    const fromPoint = squares[p.from - 1].clone();
    const toPoint = squares[p.to - 1].clone();

    function applyLayer(dt) {
      yaw += (yawGoal - yaw) * (1 - Math.exp(-dt / Math.max(0.05, yawEase)));
      let any = false;
      if (Math.abs(yaw) > 1e-4) {
        for (const bone of neckBones) rotateBoneWorld(bone, qv.setFromAxisAngle(up, yaw / neckBones.length));
        any = true;
      }
      if (tailBend) {
        tailBones.forEach((bone, i) => { bone.quaternion.multiply(tailBend[i]); bone.updateMatrixWorld(true); });
        any = true;
      }
      return any;
    }

    // The tail's bend: from her idle pose, each tail bone turned a little so the tail swings round toward its last stone and slopes
    // down to TAIL_TIP_HEIGHT over the ground, which a pawn passes under (CCD, a few rounds), kept as offsets on the bones' own turns.
    if (p.kind === 'tail' && tailBones.length) {
      actor.update(0);
      actor.root.updateMatrixWorld(true);
      const before = tailBones.map(b => b.quaternion.clone());
      const B = toPoint;
      const base = tailBones[0].getWorldPosition(new V3());
      const dx = B.x - base.x, dz = B.z - base.z, L = Math.hypot(dx, dz) || 1;
      const length = (MODEL.tailBase[0] - MODEL.tailTip) * p.scale;
      const reach = Math.min(L - 1.0, length * 0.94);
      const goal = new V3(base.x + (dx / L) * reach, 0, base.z + (dz / L) * reach);
      goal.y = heightAt(goal.x, goal.z) + TAIL_TIP_HEIGHT;
      const tip = tailBones[tailBones.length - 1];
      const tipOffset = new V3(-1.0, 0, 0); // the last bone's end, in its own frame (the model's units)
      const end = new V3(), pivot = new V3(), toEnd = new V3(), toGoal = new V3(), qq = new THREE.Quaternion();
      for (let round = 0; round < 14; round++) {
        for (let i = tailBones.length - 1; i >= 0; i--) {
          const bone = tailBones[i];
          tip.localToWorld(end.copy(tipOffset));
          bone.getWorldPosition(pivot);
          toEnd.subVectors(end, pivot).normalize();
          toGoal.subVectors(goal, pivot).normalize();
          qq.setFromUnitVectors(toEnd, toGoal);
          const angle = 2 * Math.acos(Math.min(1, Math.abs(qq.w)));
          const limit = rad(9);
          if (angle > limit) qq.slerp(new THREE.Quaternion(), 1 - limit / angle);
          rotateBoneWorld(bone, qq);
        }
      }
      tailBend = tailBones.map((b, i) => before[i].clone().invert().multiply(b.quaternion));
      tailBones.forEach((b, i) => b.quaternion.copy(before[i]));
    }

    const t = {
      kind: p.kind, from: p.from, to: p.to, actor, root: actor.root, scale: p.scale, place: p,
      get puddle() { return puddles.get(p.from) ?? null; },
      get busy() { return clock < busyUntil; },
      headPoint(out = new V3()) {
        head.updateWorldMatrix(true, false);
        return head.localToWorld(out.set(0.25, 0.62, 0)); // on top of her head, a little ahead of its joint (model units)
      },
      bow({ duration = 2.4 } = {}) {
        yawEase = duration * 0.35;
        yawGoal = yawToward(fromPoint);
        actor.lookAt(null);
        const action = actor.play('lowerHead', { fade: 0.5 });
        if (action) action.setEffectiveTimeScale(4.5 / duration);
        busyUntil = clock + duration;
        return later(duration);
      },
      lift({ duration = 3.2 } = {}) {
        const action = actor.play('liftUp', { fade: 0.3 });
        if (action) action.setEffectiveTimeScale(8 / duration);
        yawEase = duration * 0.4;
        yawGoal = 0;
        busyUntil = clock + duration;
        return later(duration);
      },
      reach(point, { duration = 1.2 } = {}) {
        yawEase = duration * 0.4;
        yawGoal = point ? yawToward(point.isVector3 ? point : new V3(...point)) : 0;
        return later(duration);
      },
      rest({ fade = 0.8 } = {}) {
        yawEase = fade;
        yawGoal = 0;
        actor.play('idle', { fade });
        busyUntil = 0;
        return later(fade);
      },
      happy() {
        actor.play('happy', { fade: 0.25 });
        busyUntil = clock + 2.4;
        return later(2.4, () => actor.play('idle', { fade: 0.5 }));
      },
      slideCurve() {
        actor.root.updateMatrixWorld(true);
        const pts = [];
        const hips = model.getObjectByName('Hips');
        if (hips) pts.push(hips.localToWorld(new V3(0, 1.3, 0)));
        tailBones.forEach((b, i) => {
          const r = 1.05 * (1 - i / tailBones.length) + 0.2; // the tail's top above its line, thinner toward the tip (model units)
          pts.push(b.localToWorld(new V3(0, r, 0)));
        });
        pts.push(tailBones[tailBones.length - 1].localToWorld(new V3(-1.0, 0.2, 0)));
        return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      },
      tailTip(out = new V3()) {
        return tailBones[tailBones.length - 1].localToWorld(out.set(-1.0, 0, 0));
      },
      watch(on) { watching = on; if (!on) { actor.lookAt(null); looking = false; } },
      _update(dt) {
        clock += dt;
        for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= clock) timers.splice(i, 1)[0].fn();
        if (layered) layerBones.forEach((bone, i) => bone.quaternion.copy(saved[i]));
      },
      _after(dt) {
        layerBones.forEach((bone, i) => saved[i].copy(bone.quaternion));
        layered = applyLayer(dt);
      },
      _watch(pawns) {
        if (!watching || clock < busyUntil) return;
        let near = null, best = (14 * p.scale) / 0.5;
        const c = actor.root.position;
        for (const pawn of pawns) { const d = Math.hypot(pawn.x - c.x, pawn.z - c.z); if (d < best) { best = d; near = pawn; } }
        if (near) {
          lookPoint.copy(near).add(lookLift);
          if (!looking) actor.lookAt(lookPoint, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
          looking = true;
        } else if (looking) {
          actor.lookAt(null);
          looking = false;
        }
      },
    };
    return t;
  }

  // ---- the camera ------------------------------------------------------------------------------------------------------
  // From the side, a little above, framed like a side-scroller:
  //   follow(target, { distance, height, lead })  eases after a pawn (an Object3D, a Vector3 that moves, a square number or a
  //                                                function filling a Vector3), a little ahead of it, the way on
  //   frame(a, b, { margin })                      holds two points in view (a lift's or a slide's two ends)
  //   pan({ duration })                            once over the whole path, left to right (a Promise); then it holds the end
  //   overview()                                   the whole path at once, from far
  const C = VALLEY.camera;
  const rig = { position: new V3(), target: new V3(), goalPosition: new V3(), goalTarget: new V3(), ease: 0.8, primed: false };
  let follow = null; // { get(out), distance, height, lead }
  let pan = null; // { t, duration, resolve }
  const followPoint = new V3();
  const halfTan = () => Math.tan(rad(camera.fov) / 2);
  function poseFor(cx, cy, distance, height, outPos, outTarget) {
    outTarget.set(cx, cy, 0);
    outPos.set(cx, cy + height * (distance / C.distance), distance);
  }
  function framePose(a, b, margin, outPos, outTarget) {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 + 1;
    const hw = Math.abs(a.x - b.x) / 2 + margin, hh = Math.abs(a.y - b.y) / 2 + margin * 0.7;
    const distance = Math.max(C.distance * 0.8, hw / (halfTan() * camera.aspect), hh / halfTan());
    poseFor(cx, cy, distance, C.height, outPos, outTarget);
  }
  const pathStart = () => squarePosition(1, new V3()).add(new V3(-4, 0, 0));
  const pathEnd = () => new V3(plan.nest[0] + 2, plan.nest[1], 0);
  camera.mode = 'overview';
  camera.overview = ({ ease = 1.2 } = {}) => {
    follow = null; pan = null;
    camera.mode = 'overview';
    rig.ease = ease;
    framePose(pathStart(), pathEnd(), 3, rig.goalPosition, rig.goalTarget);
    return camera;
  };
  camera.follow = (target, { distance = C.distance, height = C.height, lead = C.lead, ease = 0.7 } = {}) => {
    const get = typeof target === 'function' ? target
      : target?.isObject3D ? out => target.getWorldPosition(out)
        : target?.isVector3 ? out => out.copy(target)
          : Number.isFinite(target) ? out => squarePosition(target, out) : null;
    if (!get) throw new Error('camera.follow needs an Object3D, a Vector3, a square number or a function');
    follow = { get, distance, height, lead };
    pan = null;
    camera.mode = 'follow';
    rig.ease = ease;
    return camera;
  };
  camera.frame = (a, b, { margin = 4, ease = 0.8 } = {}) => {
    follow = null; pan = null;
    camera.mode = 'frame';
    rig.ease = ease;
    framePose(a.isVector3 ? a : new V3(...a), b.isVector3 ? b : new V3(...b), margin, rig.goalPosition, rig.goalTarget);
    return camera;
  };
  camera.pan = ({ duration = 10 } = {}) => {
    follow = null;
    camera.mode = 'pan';
    rig.ease = 0.25;
    return new Promise(resolve => { pan = { t: 0, duration, resolve }; });
  };
  camera.cut = () => { rig.primed = false; return camera; };
  const panFrom = new V3(), panTo = new V3();
  function updateCamera(dt) {
    if (follow) {
      follow.get(followPoint);
      poseFor(followPoint.x + follow.lead, followPoint.y + 1.4, follow.distance, follow.height, rig.goalPosition, rig.goalTarget);
    } else if (pan) {
      pan.t += dt;
      const u = Math.min(1, pan.t / pan.duration);
      const k = u * u * (3 - 2 * u);
      panFrom.copy(pathStart()); panTo.copy(pathEnd());
      const x = panFrom.x + (panTo.x - panFrom.x) * k;
      poseFor(x, plan.ground(x) + 2.5, C.distance * 1.25, C.height * 1.2, rig.goalPosition, rig.goalTarget);
      if (u >= 1) { const done = pan; pan = null; camera.mode = 'frame'; done.resolve(); }
    }
    if (!rig.primed) {
      rig.position.copy(rig.goalPosition);
      rig.target.copy(rig.goalTarget);
      rig.primed = true;
    } else {
      const k = 1 - Math.exp(-dt / Math.max(0.05, rig.ease));
      rig.position.lerp(rig.goalPosition, k);
      rig.target.lerp(rig.goalTarget, k);
    }
    camera.position.copy(rig.position);
    camera.lookAt(rig.target);
    camera.updateMatrixWorld();
    // the sun's shadow covers what the camera sees round the path
    const halfWidth = halfTan() * camera.aspect * Math.abs(camera.position.z);
    lighting.focus(new V3(rig.target.x, rig.target.y, -2), Math.min(60, halfWidth + 6));
  }

  camera.overview();

  // ---- the frame -------------------------------------------------------------------------------------------------------
  const updaters = [];
  const pawns = []; // what the Þórseðlas watch: the pawns' Object3Ds (pieces.js adds them)
  const pawnPoints = [];
  function squarePosition(n, out = new V3()) {
    if (n <= 0) {
      const [gx, gz] = plan.gate;
      return out.set(gx, heightAt(gx, gz) + 0.04, gz);
    }
    const p = squares[Math.min(count, Math.max(1, Math.round(n))) - 1];
    return out.set(p.x, p.y + stoneTop, p.z);
  }
  /** How far along the path square n is: 0 at the start (the meadow before stone 1), 1 at stone 50. */
  function progressOf(n) {
    if (n <= 0) return 0;
    const p = squares[Math.min(count, Math.max(1, n)) - 1];
    return Math.min(1, Math.max(0, (p.x - squares[0].x) / (squares[count - 1].x - squares[0].x)));
  }
  /** Where the host can stand to watch a pawn at x: behind the path and the Þórseðlas, a little back along the way. */
  function hostSpot(x, out = new V3()) {
    const hx = Math.min(plan.nest[0] - 6, Math.max(plan.startX - 4, x - 7));
    return out.set(hx, heightAt(hx, -10.5), -10.5);
  }
  function squareHeading(n) {
    const i = Math.min(count, Math.max(1, Math.round(n))) - 1;
    const a = squares[Math.max(0, i - 1)], b = squares[Math.min(count - 1, i + 1)];
    return deg(Math.atan2(b.z - a.z, b.x - a.x));
  }
  function setGlow(n, value) {
    if (n < 1 || n > count) return;
    glowHeld[n - 1] = Math.min(1, Math.max(0, value));
    glowDirty = true;
  }
  function flash(n, { strength = 1 } = {}) {
    if (n < 1 || n > count) return;
    glow[n - 1] = Math.max(glow[n - 1], strength);
    glowDirty = true;
  }
  const colourTmp = new THREE.Color(), warm = new THREE.Color('#ffe9a8');
  function updateGlow(dt) {
    let changed = glowDirty;
    for (let i = 0; i < count; i++) {
      const goal = glowHeld[i];
      const g = glow[i];
      const next = g > goal ? Math.max(goal, g - dt / 1.4) : Math.min(goal, g + dt / 0.25);
      if (next !== g || glowDirty) {
        glow[i] = next;
        glowAttr.setX(i, next);
        stones.setColorAt(i, colourTmp.copy(stoneColours[i]).lerp(warm, next * 0.55));
        changed = true;
      }
    }
    if (changed) { glowAttr.needsUpdate = true; stones.instanceColor.needsUpdate = true; }
    glowDirty = false;
  }

  const size = new THREE.Vector2();
  function update(dt) {
    time += dt;
    wind.update(time);
    for (const fn of updaters) fn(dt);
    pawnPoints.length = 0;
    pawns.forEach((pawn, i) => { pawnPoints[i] = pawn.getWorldPosition(pawnPoints[i] ?? new V3()); });
    pawnPoints.length = pawns.length;
    for (const t of thorsedlas) { t._watch(pawnPoints); t._update(dt); }
    updateActors(thorsedlas.map(t => t.actor), dt);
    for (const t of thorsedlas) t._after(dt);
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
    updateCamera(dt);
    renderer.getDrawingBufferSize(size);
    updateLevels(size.y);
    updateCharacterLods(camera, size.y);
    sky.update(time, camera);
    water.uniforms.uTime.value = time;
    flyMaterial.uniforms.uTime.value = time;
    flyMaterial.uniforms.uPixels.value = size.y / (2 * Math.tan(rad(camera.fov) / 2));
    updateGlow(dt);
  }

  function resize(width, height) {
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    if (camera.mode === 'overview') camera.overview({ ease: rig.ease });
  }

  function dispose() {
    for (const t of thorsedlas) t.actor.dispose();
    for (const o of [ground, mountains, plantsNear, plantsFar]) o.geometry.dispose();
    for (const m of [ground.material, mountains.material, plantsMaterial]) m.dispose();
    scene.remove(land);
    sky.dispose();
    for (const o of [stones, numeralsMesh, rings, props, stream, puddleMesh, fireflies]) { scene.remove(o); o.geometry.dispose(); }
    for (const m of [stoneMaterial, numeralMaterial, ringMaterial, propsMaterial, water, flyMaterial, casterMaterial, coarseMaterial]) m.dispose();
    numerals.texture.dispose();
    for (const c of casters) c.removeFromParent();
    casters.clear();
    lighting.sun.shadow.map?.dispose();
    scene.remove(lighting.sun, lighting.sun.target, lighting.hemi);
  }

  const ready = Promise.all([levelsReady, characterLodsReady()]).then(() => true);

  return {
    scene, camera, world, plan, thorsedlas, board, pawns,
    squares,
    get time() { return time; },
    squarePosition, squareHeading,
    neckAt: from => byNeck.get(from) ?? null,
    tailAt: from => byTail.get(from) ?? null,
    puddleAt: from => puddles.get(from)?.clone() ?? null,
    nest: { position: new V3(plan.nest[0], heightAt(plan.nest[0], plan.nest[2]) + 0.55, plan.nest[2]) },
    progressOf,
    hostSpot,
    glow: flash, setGlow,
    addUpdater(fn) { updaters.push(fn); return () => updaters.splice(updaters.indexOf(fn), 1); },
    registerThorsedla,
    /** The Þórseðla model's levels: [full, half, quarter, welded 3,200, welded 1,400] (BufferGeometries over its skin). */
    thorsedlaLevels: () => firstLevels,
    ready,
    update, resize,
    render() { renderer.render(scene, camera); },
    get info() { return { places: places.map(p => ({ kind: p.kind, from: p.from, to: p.to, scale: +p.scale.toFixed(3), heading: Math.round(p.heading), E: +p.E.toFixed(2) })) }; },
    dispose,
  };
}