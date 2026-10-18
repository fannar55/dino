import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { BOARD } from './rules.js';
import { pickLook } from '../looks.js';
import { createLighting } from '../lighting.js';
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
import { createForest } from '../../world/forest/forest.js';

// The valley of "Háls og hali" (spec sections 4 and 5): a scene of its own, drawn by whatever renderer it is given (the game's,
// while the chapter waits behind the book, or the lab's). Fifty numbered flat stones wind in rows across a clearing of the
// chapter's own forest, from the meadow at the front (1) over the stream and up the slope to Þórseðla's nest on the hill (50).
// Beside each neck's and each tail's first stone stands a Þórseðla, breathing, blinking and watching the pawns: the necks lift
// you up, the tails slide you down (BOARD in rules.js says which stones). Butterflies and fireflies fly over it.
//
//   const valley = await createValley(renderer, { board })
//   valley.squarePosition(n, out)   the middle of stone n's top, where a pawn stands (n 0: the gate before stone 1)
//   valley.squareHeading(n)         which way the path runs at stone n (degrees, actor.js's: 0 is +X, 90 is +Z)
//   valley.neckAt(from), tailAt(from)   the Þórseðla of a neck or a tail (see thorsedlaOf below), or null
//   valley.camera                   a PerspectiveCamera with follow(target, options), overview(), cut() and mode
//   valley.glow(n), setGlow(n, v)   stone n's numeral lights up (and fades), or is held at v (0..1)
//   valley.update(dt), render()     the frame (render draws it with the valley's own camera)
//   valley.dispose()
// and for the pawns and the game: world (actors, effects, heightAt, resolvePoint), scene, addUpdater(fn), registerThorsedla(actor),
// thorsedlas, puddleAt(from), nest, ready (resolves when every Þórseðla has its light levels), info.
//
// Sizes are metres. The pawns are small (Mosi about 2 m long on a 2 m stone), the Þórseðlas about half their real size: giants
// beside the pawns, light enough that ten of them stand in the tablet's budget (STYLE.md section 11): they share one model, draw
// a level of 1/2 to 1/16 of its triangles by their size on screen, and cast the sun's shadow with the 1/16.

const THORSEDLA_URL = new URL('../../assets/characters/brontosaurus.glb', import.meta.url).href;
const V3 = THREE.Vector3;
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const VALLEY = {
  stone: { spacing: 2.6, radius: 1.02, top: 0.2 }, // centre to centre along the path; a stone's radius and how high its top stands
  rows: { per: 10, gap: 7.4, wobble: 0.55 }, // stones a row, metres between rows, sideways wander of a row
  clearing: { radius: 24, forestEdge: 30 },
  slope: { rise: 3.2 }, // the ground rises this much from the front row to the back row
  hill: { height: 2.4, radius: 7.5 }, // the nest's hill beyond stone 50
  stream: { width: 2.2, depth: 0.25 }, // across the valley between the second and third rows: its width and the hollow's depth
  thorsedla: { scale: 0.5, vary: 0.05 }, // their size against the real Þórseðla's 22 m
  forestGrass: 0.7, // the clearing's grass, as a share of the preset's density
  look: 'morning', // the chapter's light (kafli1): the fog's shader chunk stays the same as the chapter's
};

// The model's measures (brontosaurus.glb at its real size, facing +X, the root between the feet): the neck's base, how far ahead
// of it the head comes down in lowerHead, the tail's base and its tip, half the body's width over the feet, the bind diagonal.
const MODEL = { neckBase: [3.26, 4.01], bowReach: 4.13, tailBase: [-3.66, 4.21], tailTip: -13.6, chest: 2.24, hips: -2.18, halfWidth: 1.9, diagonal: 24.1 };

// ---------------------------------------------------------------------------------------------------------------------------
// The path: rows of `per` stones joined by half circles, each row wandering a little, the stones spaced evenly along it.

function buildPath(count) {
  const { spacing: S } = VALLEY.stone;
  const { per, gap, wobble } = VALLEY.rows;
  const arc = (Math.PI * gap) / 2;
  const rows = Math.ceil(count / per);
  // Turn i is centred between stones per*(i+1) and per*(i+1)+1, so every row but the first and last has a straight of
  // per*S - arc; the first and the last reach out further (the meadow's way in, the climb to the nest).
  const middle = per * S - arc;
  const first = (per - 0.5) * S - arc / 2;
  const last = (count - 1 - (rows - 1) * per + 0.5) * S - arc / 2 + 2.5;
  // Rows run along X at z = -r * gap (the first at the front), the even ones east and the odd ones west; the middle rows' straights
  // run from x = 0 to x = middle, the first starts further west and the last runs on further.
  const pts = [];
  const STEP = 0.1;
  for (let r = 0; r < rows; r++) {
    const length = r === 0 ? first : r === rows - 1 ? last : middle;
    const east = r % 2 === 0;
    const x0 = east ? (r === 0 ? middle - first : 0) : middle;
    const n = Math.ceil(length / STEP);
    const side = r % 3 === 1 ? 1 : -1;
    for (let k = r === 0 ? 0 : 1; k <= n; k++) {
      const u = k / n;
      // the row bows gently to one side and back, so it reads as a trail rather than a ruler
      const sway = wobble * Math.sin(Math.PI * u) * side;
      pts.push([x0 + (east ? 1 : -1) * u * length, -r * gap + sway]);
    }
    if (r < rows - 1) {
      // a half circle round the row's end to the start of the next: bulging east after an east row, west after a west row
      const cx = east ? middle : 0, cz = -r * gap - gap / 2;
      const m = Math.ceil(arc / STEP);
      for (let k = 1; k <= m; k++) {
        const t = (Math.PI * k) / m;
        const ang = east ? Math.PI / 2 - t : Math.PI / 2 + t;
        pts.push([cx + Math.cos(ang) * (gap / 2), cz + Math.sin(ang) * (gap / 2)]);
      }
    }
  }
  // even steps along the polyline
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const stones = [];
  let j = 0;
  for (let n = 0; n < count; n++) {
    const s = n * S;
    while (j < along.length - 2 && along[j + 1] < s) j++;
    const t = Math.min(1, Math.max(0, (s - along[j]) / (along[j + 1] - along[j] || 1)));
    stones.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return { pts, stones, total: along[along.length - 1] };
}

/**
 * The valley's plan: where every stone stands (centred on the clearing), the path's line for the forest, the stream, the nest, and
 * the ground's own rise (a function the forest's terrain adds). Pure: no three.js scene.
 */
export function planValley(board = BOARD) {
  const { pts, stones } = buildPath(board.size);
  // centre the board on the clearing, the front row toward +Z (the camera's side)
  const xs = stones.map(s => s[0]), zs = stones.map(s => s[1]);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2;
  const oz = (Math.min(...zs) + Math.max(...zs)) / 2 - 1.5;
  const shift = ([x, z]) => [x - ox, z - oz];
  const squares = stones.map(shift);
  const line = pts.filter((_, i) => i % 6 === 0).map(shift);
  const last = squares[squares.length - 1], before = squares[squares.length - 2];
  const out = [last[0] - before[0], last[1] - before[1]];
  const len = Math.hypot(...out) || 1;
  const nest = [last[0] + (out[0] / len) * 4.6, last[1] + (out[1] / len) * 4.6 - 1.2];
  // the way in from the meadow before stone 1, and on from 50 to the nest
  const a = squares[0], b = squares[1];
  const back = [a[0] - b[0], a[1] - b[1]].map(v => v / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1));
  const gate = [a[0] + back[0] * 3.4, a[1] + back[1] * 3.4];
  const path = [[gate[0] + back[0] * 12, gate[1] + back[1] * 12 + 4], gate, ...line, nest];

  // The stream runs across the valley between the second and the third rows, in at the west through the turn and out at the east.
  const zRow = r => squares[r * VALLEY.rows.per + 4][1];
  const zs2 = (zRow(1) + zRow(2)) / 2;
  const x0 = Math.min(...squares.map(s => s[0])), x1 = Math.max(...squares.map(s => s[0]));
  const stream = [];
  for (let x = x0 - 26; x <= x1 + 26; x += 1) stream.push([x, zs2 + 0.9 * Math.sin(x * 0.21) + 0.5 * Math.sin(x * 0.53 + 1)]);
  const streamDistance = (x, z) => {
    const i = Math.round(x - (x0 - 26));
    if (i < 0 || i >= stream.length) return Infinity;
    let best = Infinity;
    for (let k = Math.max(0, i - 3); k < Math.min(stream.length - 1, i + 3); k++) {
      const [ax, az] = stream[k], [bx, bz] = stream[k + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };

  const zFront = squares[0][1], zBack = squares[squares.length - 1][1];
  const { rise } = VALLEY.slope;
  const { height: hillH, radius: hillR } = VALLEY.hill;
  const { width: sw, depth: sd } = VALLEY.stream;
  /** The ground's own shape on top of the forest's: the slope up to the back rows, the nest's hill, the stream's bed. */
  function lift(x, z) {
    let h = rise * smoothstep(zFront + 2, zBack - 4, z);
    h += hillH * Math.exp(-((x - nest[0]) ** 2 + (z - nest[1]) ** 2) / (2 * hillR * hillR));
    const d = streamDistance(x, z);
    if (d < sw * 2.5) h -= sd * (1 - smoothstep(0, sw * 2.5, d)); // a soft, wide hollow the water lies in
    return h;
  }
  return { squares, path, stream, streamDistance, nest, gate, lift };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Where each Þórseðla stands, worked out from the stones (any board of BOARD's shape):
//  - a neck's stands so that her head comes down onto its first stone: lowerHead brings it down MODEL.bowReach ahead of her
//    neck's base, and she turns her neck up to 80 degrees to either side for it;
//  - a tail's stands with the base of her tail just beside its first stone and her body reaching away from it, so her tail runs
//    back past the stone toward the last one. Her tail stays up off the ground, high enough for a pawn to pass under it: the slide
//    goes down it to the tip, and the pawn flies the rest of the way into the puddle by the last stone.
// Each tries headings all round and keeps the one where nothing of her body stands on a stone, on a Þórseðla placed before her or
// in the trees, and from which her neck or tail points best toward her last stone. Tails choose first.

function segPointDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function segSegDistance(a, b, c, d) {
  return Math.min(
    segPointDistance(a[0], a[1], c[0], c[1], d[0], d[1]), segPointDistance(b[0], b[1], c[0], c[1], d[0], d[1]),
    segPointDistance(c[0], c[1], a[0], a[1], b[0], b[1]), segPointDistance(d[0], d[1], a[0], a[1], b[0], b[1]),
  );
}

export function placeThorsedlas(plan, board = BOARD, { seed = 7 } = {}) {
  const { squares } = plan;
  const R = VALLEY.stone.radius;
  const clearR = VALLEY.clearing.radius;
  let s = seed >>> 0;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const jobs = [
    ...board.tails.map(([from, to]) => ({ kind: 'tail', from, to })),
    ...board.necks.map(([from, to]) => ({ kind: 'neck', from, to })),
  ];
  const placed = [];
  const HEADINGS = 96;
  for (const job of jobs) {
    const k = VALLEY.thorsedla.scale * (1 + (random() * 2 - 1) * VALLEY.thorsedla.vary);
    const A = squares[job.from - 1], B = squares[job.to - 1];
    const half = MODEL.halfWidth * k;
    let best = null;
    for (let i = 0; i < HEADINGS; i++) {
      const heading = (i / HEADINGS) * Math.PI * 2;
      const fx = Math.cos(heading), fz = Math.sin(heading);
      const options = [];
      if (job.kind === 'neck') {
        for (const turn of [-80, -55, -30, 0, 30, 55, 80].map(rad)) {
          const reach = MODEL.bowReach * k + 0.55;
          const nx = A[0] - Math.cos(heading + turn) * reach, nz = A[1] - Math.sin(heading + turn) * reach;
          options.push({ rx: nx - fx * MODEL.neckBase[0] * k, rz: nz - fz * MODEL.neckBase[0] * k, turn });
        }
      } else {
        for (const side of [-1.1, 0, 1.1]) {
          const bx = A[0] + fx * (R + 0.35) - fz * side, bz = A[1] + fz * (R + 0.35) + fx * side;
          options.push({ rx: bx - fx * MODEL.tailBase[0] * k, rz: bz - fz * MODEL.tailBase[0] * k, turn: 0 });
        }
      }
      for (const { rx, rz, turn } of options) {
        const at = d => [rx + fx * d * k, rz + fz * d * k];
        const chest = at(MODEL.chest + 0.5), hips = at(MODEL.hips - 0.3);
        const tail0 = at(MODEL.tailBase[0]);
        const tailLength = (MODEL.tailBase[0] - MODEL.tailTip) * k;
        let tail1;
        if (job.kind === 'tail') { // toward the last stone, as far as it reaches
          const dx = B[0] - tail0[0], dz = B[1] - tail0[1], L = Math.hypot(dx, dz) || 1;
          const reach = Math.min(L - R - 0.6, tailLength * 0.95);
          tail1 = [tail0[0] + (dx / L) * reach, tail0[1] + (dz / L) * reach];
        } else tail1 = at(MODEL.tailTip + 1);
        let E = 0;
        // her body on no stone; her tail over as few as may be (a pawn passes under, but the path should read clear)
        squares.forEach((q, n) => {
          const square = n + 1;
          if (square !== job.from) {
            const d = segPointDistance(q[0], q[1], chest[0], chest[1], hips[0], hips[1]) - (half + R + 0.3);
            if (d < 0) E += 50 + d * d * 60;
          } else if (job.kind === 'tail') {
            const d = segPointDistance(q[0], q[1], chest[0], chest[1], hips[0], hips[1]) - (half + R * 0.6);
            if (d < 0) E += 50 + d * d * 60;
          }
          if (square !== job.from && square !== job.to) {
            const d = segPointDistance(q[0], q[1], tail0[0], tail0[1], tail1[0], tail1[1]) - (R + 0.2);
            if (d < 0) E += job.kind === 'tail' ? 1.2 : 2.5;
          }
        });
        for (const p of placed) {
          const d = segSegDistance(chest, hips, p.chest, p.hips) - (half + p.half + 0.8);
          if (d < 0) E += 50 + d * d * 40;
          const t = Math.min(segSegDistance(chest, hips, p.tail0, p.tail1), segSegDistance(tail0, tail1, p.chest, p.hips)) - (half + 0.5);
          if (t < 0) E += 20 + t * t * 20;
          if (segSegDistance(tail0, tail1, p.tail0, p.tail1) < 0.9) E += 6;
          // the head of a neck's Þórseðla comes down in front of her: keep others' bodies out of the way
        }
        for (const p of [chest, hips, tail1]) {
          const r = Math.hypot(...p);
          if (r > clearR - 3) E += 10 + (r - clearR + 3) ** 2 * 4;
        }
        if (job.kind === 'tail') {
          const dx = B[0] - tail0[0], dz = B[1] - tail0[1], L = Math.hypot(dx, dz) || 1;
          const along = -(fx * dx + fz * dz) / L; // 1: her tail points straight at the last stone
          E += (1 - along) * 8;
          if (along < 0.2) E += 30;
        } else {
          const nb = at(MODEL.neckBase[0]);
          const dx = B[0] - nb[0], dz = B[1] - nb[1], L = Math.hypot(dx, dz) || 1;
          const facing = (fx * dx + fz * dz) / L;
          E += (1 - facing) * 2 + Math.abs(turn) * 1.2;
        }
        E += Math.abs(fz) * 0.4; // a little rather from the side, as the camera at the front sees her
        if (!best || E < best.E) best = { E, rx, rz, heading, turn, chest, hips, tail0, tail1, half };
      }
    }
    placed.push({ ...job, ...best, scale: k, heading: deg(best.heading) });
  }
  return placed;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Light levels for the Þórseðlas: the model's skin simplified to 1/2 ... 1/16 of its triangles once (in a worker), each level an
// index buffer over the same vertex buffers (engine/simplify.js), as character-lod.js does for the chapter's characters.

const LEVELS = [0.5, 0.25, 0.125, 0.0625];
const LEVEL_PX = [1100, 600, 300, 150]; // the full skin above the first, a level below each
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

function lightLevels(geometry) {
  if (levelCache.has(geometry)) return levelCache.get(geometry);
  const position = geometry.attributes.position;
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) { positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i); }
  const { skinIndex, skinWeight } = geometry.attributes;
  const indices = new Int32Array(position.count * 4), weights = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) for (let c = 0; c < 4; c++) { indices[i * 4 + c] = skinIndex.getComponent(i, c); weights[i * 4 + c] = skinWeight.getComponent(i, c); }
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const diagonal = geometry.boundingBox.getSize(new V3()).length();
  const options = { levels: LEVELS.map((ratio, i) => ({ ratio, maxError: i < 2 ? [0.001, 0.0025][i] * diagonal : Infinity })), skin: { indices, weights } };
  const promise = simplifyInWorker(positions, Uint32Array.from(geometry.index.array), options).then(levels => [geometry, ...levels.map(({ corners }) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) g.setAttribute(name, attribute);
    g.setIndex(new THREE.BufferAttribute(position.count < 65536 ? Uint16Array.from(corners) : corners, 1));
    g.boundingBox = geometry.boundingBox;
    g.boundingSphere = geometry.boundingSphere;
    return g;
  })]);
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

// ---------------------------------------------------------------------------------------------------------------------------
// The stones and their numerals.

function stoneGeometry() {
  const { radius: r, top } = VALLEY.stone;
  const profile = [
    [0.001, -0.25], [r * 0.9, -0.25], [r * 0.98, -0.05], [r, top * 0.45], [r * 0.95, top * 0.85], [r * 0.82, top], [r * 0.4, top + 0.02], [0.001, top + 0.025],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(profile, 22);
  // a little lumpy, so no two stones read as one turned shape
  const p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const bump = 1 + 0.045 * Math.sin(a * 3 + 0.7) + 0.03 * Math.sin(a * 5 + 2.1);
    p.setXYZ(i, v.x * bump, v.y, v.z * bump);
  }
  g.computeVertexNormals();
  return g;
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
    const g = new THREE.IcosahedronGeometry(0.16, 1);
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
    const g = new THREE.SphereGeometry(0.34, 16, 12);
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
  float flow = sin(vUv.x * 2.1 - uTime * 1.7 + sin(vUv.y * 6.0) * 0.8) * 0.5 + 0.5;
  float ripple = sin(vUv.x * 5.3 - uTime * 2.6 + vUv.y * 3.0) * sin(vUv.x * 1.3 + uTime * 0.7);
  vec3 c = mix(uDeep, uShallow, smoothstep(0.35, 1.0, edge) * 0.8 + flow * 0.15);
  c += uGlint * smoothstep(0.82, 0.98, ripple * 0.5 + 0.5) * (1.0 - edge * 0.6);
  gl_FragColor = vec4(c, 1.0 - smoothstep(0.62, 1.0, edge));
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
  gl_PointSize = aFly.w * uPixels / -mvPosition.z * (0.55 + 0.45 * vGlow);
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
}`;

// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The valley. `renderer` draws it (and builds its sky light); `board` is rules.js's BOARD (or one of the same shape); `q` a quality
 * preset (engine/quality.js, tablet by default); `params` URL parameters for the forest's profiling switches. Resolves once the
 * forest, the stones and the Þórseðlas are in the scene; `valley.ready` resolves once their light levels are in place too.
 */
export async function createValley(renderer, { board = BOARD, q = PRESETS.tablet, params = new URLSearchParams(), win = globalThis.window } = {}) {
  const look = pickLook(VALLEY.look);
  const scene = new THREE.Scene();
  scene.name = 'Háls og hali';
  const camera = new THREE.PerspectiveCamera(40, 16 / 10, 0.3, 1200);
  camera.name = 'Valley camera';
  scene.add(camera); // the egg die rides in front of it
  const lighting = createLighting(scene, look, q);
  lighting.sun.name = 'Valley sun';
  installDepthShadows(renderer, lighting.sun);
  installFog(scene, look, lighting.direction);
  const sky = createSky({ renderer, scene, look, sunDir: lighting.direction });
  const wind = createWind();
  const plan = planValley(board);
  const places = placeThorsedlas(plan, board);

  let time = 0;
  const world = {
    THREE, renderer, scene, camera, q, params, look, lighting, wind,
    chapter: { look: VALLEY.look, actors: {}, shots: {} },
    heightAt: () => 0,
    actors: new Map(),
    effects: createEffects(),
    clock: { get time() { return time; } },
  };
  world.resolvePoint = createPointResolver(world);

  // The forest: the chapter's own, round a clearing that holds the board, its path the stones' path. The Þórseðlas' bodies are
  // kept clear of plants as actors are (a point every few metres along each).
  const keepClear = {};
  places.forEach((p, i) => {
    const pts = [p.chest, [(p.chest[0] + p.hips[0]) / 2, (p.chest[1] + p.hips[1]) / 2], p.hips, p.tail0, [(p.tail0[0] + p.tail1[0]) / 2, (p.tail0[1] + p.tail1[1]) / 2]];
    pts.forEach(([x, z], k) => { keepClear[`thorsedla-${i}-${k}`] = { position: [x, 0, z], heading: p.heading }; });
  });
  keepClear.nest = { position: [plan.nest[0], 0, plan.nest[1]], heading: 0 };
  // The clearing is wider than the chapter's, so its grass is a little thinner (forestGrass: the share of the preset's density).
  const forestWorld = Object.create(world);
  forestWorld.q = { ...q, grass: q.grass * VALLEY.forestGrass };
  const forest = await createForest(forestWorld, {
    seed: 23,
    clearing: { center: [0, 0], radius: VALLEY.clearing.radius },
    forestEdge: VALLEY.clearing.forestEdge,
    path: plan.path,
    actors: keepClear,
    shots: {},
    lift: plan.lift,
  });
  world.forest = forest;
  world.heightAt = (x, z) => forest.heightAt(x, z);
  const heightAt = world.heightAt;

  // ---- stones ----------------------------------------------------------------------------------------------------------
  const count = board.size;
  const stars = new Set(board.stars ?? []);
  const fruit = new Set(board.fruit ?? []);
  const squares = plan.squares.map(([x, z]) => {
    const water = plan.streamDistance(x, z) < VALLEY.stream.width;
    const y = heightAt(x, z) + (water ? 0.14 : 0.04); // a stepping stone stands a little higher out of the water
    return new V3(x, y, z);
  });
  const stoneTop = VALLEY.stone.top + 0.025;
  const stoneMaterial = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, envMapIntensity: 0.4 });
  const stones = new THREE.InstancedMesh(stoneGeometry(), stoneMaterial, count);
  stones.name = 'Stones';
  stones.castShadow = true;
  stones.receiveShadow = true;
  const stoneColours = [];
  {
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new V3();
    let s = 99;
    const random = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const base = [new THREE.Color('#c9b38e'), new THREE.Color('#bfab8a'), new THREE.Color('#cdb894'), new THREE.Color('#b8a688')];
    squares.forEach((p, i) => {
      // tipped to the slope under it
      const e = 0.6;
      const nx = heightAt(p.x - e, p.z) - heightAt(p.x + e, p.z), nz = heightAt(p.x, p.z - e) - heightAt(p.x, p.z + e);
      const up = new V3(nx * 0.5, 2 * e, nz * 0.5).normalize();
      qn.setFromUnitVectors(new V3(0, 1, 0), up).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), random() * Math.PI * 2));
      const k = 0.97 + random() * 0.08;
      sc.set(k, 1, k);
      m.compose(p, qn, sc);
      stones.setMatrixAt(i, m);
      const c = base[i % base.length].clone().offsetHSL(0, 0, (random() - 0.5) * 0.05);
      stoneColours.push(c);
      stones.setColorAt(i, c);
    });
  }
  scene.add(stones);

  // the numerals: flat on each stone, upright for the camera at the front of the valley
  const fontsReady = win?.document?.fonts?.load?.('900 92px Nunito').catch(() => null);
  await Promise.race([fontsReady, new Promise(resolve => setTimeout(resolve, 1500))]);
  const numerals = drawNumerals(count, stars);
  const numeralGeometry = new THREE.PlaneGeometry(1.28, 1.28);
  numeralGeometry.rotateX(-Math.PI / 2);
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
      m.compose(new V3(p.x, p.y + stoneTop, p.z), qn, new V3(1, 1, 1));
      numeralsMesh.setMatrixAt(i, m);
    });
  }
  scene.add(numeralsMesh);
  // a soft ring of light round a stone that glows
  const ringGeometry = new THREE.PlaneGeometry(3.2, 3.2);
  ringGeometry.rotateX(-Math.PI / 2);
  ringGeometry.setAttribute('aGlow', glowAttr);
  const ringMaterial = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color('#ffd76a').convertSRGBToLinear() } },
    vertexShader: 'attribute float aGlow; varying float vGlow; varying vec2 vUv; void main() { vGlow = aGlow; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColour; varying float vGlow; varying vec2 vUv; void main() { float r = length(vUv - 0.5) * 2.0; float ring = smoothstep(0.55, 0.72, r) * (1.0 - smoothstep(0.72, 1.0, r)); if (vGlow < 0.01) discard; gl_FragColor = vec4(uColour * ring * vGlow * 1.4, 1.0); }',
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
    let s = 5;
    const random = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (const n of fruit) {
      const p = squares[n - 1];
      // beside the stone, on the side away from the next row
      const prev = squares[Math.max(0, n - 2)], next = squares[Math.min(count - 1, n)];
      const tx = next.x - prev.x, tz = next.z - prev.z, L = Math.hypot(tx, tz) || 1;
      let sx = -tz / L, sz = tx / L;
      const test = (k) => places.some(pl => Math.hypot(pl.chest[0] - (p.x + sx * k), pl.chest[1] - (p.z + sz * k)) < 3);
      const free = side => squares.every((o, i) => i === n - 1 || Math.hypot(o.x - (p.x + sx * side * 2.2), o.z - (p.z + sz * side * 2.2)) > 2.2);
      if (!free(1) || test(2.2)) { sx = -sx; sz = -sz; }
      const g = fruitTree(random);
      g.rotateY(random() * Math.PI * 2);
      const x = p.x + sx * 2.1, z = p.z + sz * 2.1;
      g.translate(x, heightAt(x, z) - 0.05, z);
      propParts.push(g);
    }
    const nest = nestGeometry(random);
    nest.translate(plan.nest[0], heightAt(plan.nest[0], plan.nest[1]) - 0.1, plan.nest[1]);
    propParts.push(nest);
  }
  const props = new THREE.Mesh(mergeGeometries(propParts), propsMaterial);
  props.name = 'Fruit trees and nest';
  props.castShadow = true;
  props.receiveShadow = true;
  scene.add(props);

  const water = waterMaterial();
  const stream = new THREE.Mesh(ribbonGeometry(plan.stream, VALLEY.stream.width * 1.4, heightAt, 0.07), water);
  stream.renderOrder = 2;
  stream.name = 'Stream';
  stream.receiveShadow = false;
  scene.add(stream);
  // a puddle by each tail's last stone, on the side her tail comes in from: the splash at the bottom of the slide
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
    const dx = p.tail1[0] - B.x, dz = p.tail1[1] - B.z, L = Math.hypot(dx, dz) || 1;
    const at = new V3(B.x + (dx / L) * 1.7, 0, B.z + (dz / L) * 1.7);
    at.y = heightAt(at.x, at.z) + 0.03;
    puddleMesh.setMatrixAt(i, new THREE.Matrix4().compose(at, new THREE.Quaternion(), new V3(1.05, 1, 0.8)));
    puddles.set(p.from, at);
  });
  scene.add(puddleMesh);

  // ---- fireflies -------------------------------------------------------------------------------------------------------
  const flyCount = q.name === 'low' ? 36 : 72;
  const flyPositions = new Float32Array(flyCount * 3), flyData = new Float32Array(flyCount * 4);
  {
    let s = 41;
    const random = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < flyCount; i++) {
      let x, z;
      if (i % 3 === 0) { // over the stream
        const p = plan.stream[Math.floor(random() * plan.stream.length)];
        x = p[0] + (random() - 0.5) * 3; z = p[1] + (random() - 0.5) * 3;
      } else { // in the shade at the forest's edge
        const a = random() * Math.PI * 2, r = VALLEY.clearing.radius - 2 + random() * 9;
        x = Math.cos(a) * r; z = Math.sin(a) * r;
      }
      flyPositions.set([x, heightAt(x, z) + 0.6 + random() * 2.2, z], i * 3);
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
  casterMaterial.shadowSide = THREE.FrontSide;
  if (sun.castShadow) {
    const before = sun.shadow.updateMatrices;
    sun.shadow.updateMatrices = function valleyShadowPass(l, viewport) {
      before.call(this, l, viewport);
      if (l === sun) for (const c of casters) c.visible = c.userData.owner.visible;
    };
  }
  let levelsReady = null;
  function registerThorsedla(actor) {
    const mesh = skinOf(actor.model);
    const entry = { actor, mesh, levels: null, level: 0, caster: null };
    light.push(entry);
    const ready = lightLevels(mesh.geometry).then(levels => {
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
  // overview(): the whole valley from the front and above. follow(target): close behind a pawn, a little to the front of the valley so
  // the numerals read upright, easing after it (target: an Object3D, a Vector3 that moves, or a function filling a Vector3).
  const bounds = new THREE.Box3();
  for (const p of squares) bounds.expandByPoint(p);
  bounds.expandByPoint(new V3(plan.nest[0], heightAt(plan.nest[0], plan.nest[1]) + 1, plan.nest[1]));
  const boardCentre = bounds.getCenter(new V3());
  const rig = { position: new V3(), target: new V3(), goalPosition: new V3(), goalTarget: new V3(), ease: 0.9, primed: false };
  const OVERVIEW = { elevation: 60, azimuth: 6, fill: 0.88 };
  function overviewPose(outPos, outTarget) {
    const corners = [];
    for (const p of squares) for (const [dx, dz] of [[0, 1.4], [0, -1.4], [1.4, 0], [-1.4, 0]]) corners.push(p.clone().add(new V3(dx, 0.8, dz)));
    for (const t of places) corners.push(new V3(t.chest[0], heightAt(t.chest[0], t.chest[1]) + 4.5 * t.scale / 0.5, t.chest[1]));
    corners.push(new V3(plan.nest[0], heightAt(plan.nest[0], plan.nest[1]) + 1.5, plan.nest[1]));
    const dir = new V3(Math.sin(rad(OVERVIEW.azimuth)) * Math.cos(rad(OVERVIEW.elevation)), Math.sin(rad(OVERVIEW.elevation)), Math.cos(rad(OVERVIEW.azimuth)) * Math.cos(rad(OVERVIEW.elevation)));
    const target = new THREE.Box3().setFromPoints(corners).getCenter(new V3());
    let distance = 60;
    const probe = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.5, 1000);
    const v = new V3(), right = new V3(), upv = new V3();
    for (let round = 0; round < 40; round++) {
      probe.position.copy(target).addScaledVector(dir, distance);
      probe.lookAt(target);
      probe.updateMatrixWorld(true);
      let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const c of corners) { v.copy(c).project(probe); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const halfH = Math.tan(rad(probe.fov) / 2) * distance;
      probe.matrixWorld.extractBasis(right, upv, v);
      target.addScaledVector(right, ((x0 + x1) / 2) * halfH * probe.aspect * 0.5).addScaledVector(upv, ((y0 + y1) / 2) * halfH * 0.5);
      distance *= Math.min(1.5, Math.max(0.7, Math.max((x1 - x0) / 2, (y1 - y0) / 2) / OVERVIEW.fill));
    }
    outTarget.copy(target);
    outPos.copy(target).addScaledVector(dir, distance);
  }
  let follow = null; // { get(out), distance, height, side }
  const followPoint = new V3(), tangent = new V3();
  camera.mode = 'overview';
  camera.overview = ({ ease = 1.2 } = {}) => {
    follow = null;
    camera.mode = 'overview';
    rig.ease = ease;
    overviewPose(rig.goalPosition, rig.goalTarget);
    return camera;
  };
  camera.follow = (target, { distance = 9.5, height = 6.2, ease = 0.7 } = {}) => {
    const get = typeof target === 'function' ? target
      : target?.isObject3D ? out => target.getWorldPosition(out)
        : target?.isVector3 ? out => out.copy(target)
          : Number.isFinite(target) ? out => squarePosition(target, out) : null;
    if (!get) throw new Error('camera.follow needs an Object3D, a Vector3, a square number or a function');
    follow = { get, distance, height };
    camera.mode = 'follow';
    rig.ease = ease;
    return camera;
  };
  camera.cut = () => { rig.primed = false; return camera; };
  function updateCamera(dt) {
    if (follow) {
      follow.get(followPoint);
      // the path's way here, from the nearest stone: the camera stands a little behind along it and well to the front
      let nearest = 0, best = Infinity;
      squares.forEach((p, i) => { const d = p.distanceToSquared(followPoint); if (d < best) { best = d; nearest = i; } });
      const a = squares[Math.max(0, nearest - 1)], b = squares[Math.min(count - 1, nearest + 1)];
      tangent.subVectors(b, a).setY(0).normalize();
      const back = new V3(-tangent.x * 0.45, 0, 0.9 + Math.max(0, -tangent.z) * 0.2).normalize();
      rig.goalTarget.copy(followPoint).addScaledVector(tangent, 1.6).add(new V3(0, 0.6, -0.8));
      rig.goalPosition.copy(followPoint).addScaledVector(back, follow.distance).add(new V3(0, follow.height, 0));
    }
    if (!rig.primed) {
      if (!follow && camera.mode === 'overview') overviewPose(rig.goalPosition, rig.goalTarget);
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
    // the sun's shadow covers what the camera looks at: the board, or the ground round the pawn
    if (camera.mode === 'overview') lighting.focus(boardCentre, 27);
    else lighting.focus(rig.target, 13);
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
    forest.update(dt, time);
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
    if (camera.mode === 'overview') overviewPose(rig.goalPosition, rig.goalTarget);
  }

  function dispose() {
    for (const t of thorsedlas) t.actor.dispose();
    forest.dispose();
    sky.dispose();
    for (const o of [stones, numeralsMesh, rings, props, stream, puddleMesh, fireflies]) { scene.remove(o); o.geometry.dispose(); }
    for (const m of [stoneMaterial, numeralMaterial, ringMaterial, propsMaterial, water, flyMaterial, casterMaterial]) m.dispose();
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
    nest: { position: new V3(plan.nest[0], heightAt(plan.nest[0], plan.nest[1]) + 0.55, plan.nest[1]) },
    glow: flash, setGlow,
    addUpdater(fn) { updaters.push(fn); return () => updaters.splice(updaters.indexOf(fn), 1); },
    registerThorsedla,
    ready,
    update, resize,
    render() { renderer.render(scene, camera); },
    get info() { return { forest: forest.info, places: places.map(p => ({ kind: p.kind, from: p.from, to: p.to, scale: +p.scale.toFixed(3), heading: Math.round(p.heading), E: +p.E.toFixed(2) })) }; },
    dispose,
  };
}
