import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { BOARD, SHORTCUTS, DINOSAURS, tilePosition } from './rules.js';

// The board of "Háls og hali" in the world (spec sections 3 and 4): 100 squares on five tiers of 20, seen from the side, at
// Codex's measures (rules.js: 2.3 m from square to square) with the tiers 7.5 m apart, in metres. Each tier is a flat mossy log
// with twenty sandstone blocks on it, each block with its number on a plaque on the face toward the camera. The tiers zigzag
// in depth (rules.js BOARD.recess): the second and the fourth stand in front, the others further back, so a Þórseðla standing
// behind a front tier has the tier above and the tier below both behind her, her neck rising in front of the one and her
// tail hanging down onto the other. The ends of the tiers are joined by wooden stairs (20 to 21, 40 to 41, 60 to 61, 80 to
// 81), each a flight from one tier's end up to the next one's, and they hold the logs' ends. Behind a front tier, a mossy rock
// shelf carries the Þórseðla who stands there (thorsedla.js), at the tier's height.
//
//   const board = createBoard({ base, heightAt, shelves })
//   board.group                       everything, to add to the scene
//   board.square(n, out)              where a piece stands on square n: the middle of the block's top (n 0: the start, before 1)
//   board.stairs(n)                   the stairs from square n up to n + 1, or null: { from, to, point(u, out), length }
//   board.decorate(events)            the adventure's marks on their squares (rules.js SPECIAL_TILES), or [] for none
//   board.glow(n, colour)             square n's plaque lights up and fades (a landing, a count)
//   board.tierY(r), board.tierZ(r)    a tier's block tops (height) and the middle of its blocks (depth)
//   board.update(dt)
//   board.dispose()
//
// `base` is the height of tier 0's block tops over the ground at the board, `heightAt` the forest's ground, `shelves` the rock
// shelves to put behind the tiers: [{ tier, x0, x1, z0, z1 }] (the Þórseðlas' places, places.js shelfFor).

// The plaque nearly fills the block's face, so the numbers read from the whole board. The blocks are deep enough for two pieces
// side by side, with a Þórseðla's head resting just behind them (places.js BLOCK_BACK is half the depth).
export const STONE = { width: 1.7, height: 1.25, depth: 2.4, plaque: [1.56, 1.1] };
// Where a neck rises in front of a tier, the blocks on either side of it stand apart by about the neck's thickness, so it
// passes through empty space and hides no number (the owner's word, 2026-10-19): the gap there is `NECK_GAP` metres, and the
// tier's other blocks stand a little closer to make room, so its ends stay where the other tiers' ends are.
export const NECK_GAP = 2.0;

/** The gaps a tier opens for necks: { tier: [c, ...] }, each c the column the gap follows (between c and c + 1). */
function neckGaps() {
  const gaps = {};
  for (const d of DINOSAURS) {
    if (!d.neck || Math.round((tilePosition(d.neck.to).y - tilePosition(d.neck.from).y) / BOARD.rowHeight) !== 1) continue;
    // the gap before the neck's last square, on the side she stands
    const n = d.neck.to, tier = Math.floor((n - 1) / BOARD.columns), offset = (n - 1) % BOARD.columns;
    const column = tier % 2 ? BOARD.columns - 1 - offset : offset;
    (gaps[tier] ??= []).push(d.facing > 0 ? column - 1 : column);
  }
  return gaps;
}
const GAPS = neckGaps();

/** Where square n's block stands (x along the board, y its top over tier 0's, z its middle), with the necks' gaps. */
export function squareAt(n) {
  const p = tilePosition(n);
  if (n === 0) return p;
  const tier = Math.floor((n - 1) / BOARD.columns), gaps = GAPS[tier];
  if (!gaps) return p;
  const offset = (n - 1) % BOARD.columns, column = tier % 2 ? BOARD.columns - 1 - offset : offset;
  const extra = NECK_GAP + STONE.width - BOARD.spacing; // what a gap adds to an ordinary step
  const width = (BOARD.columns - 1) * BOARD.spacing;
  const step = (width - gaps.length * extra) / (BOARD.columns - 1);
  const before = gaps.filter(c => c < column).length;
  return { ...p, x: -width / 2 + column * step + before * extra };
}
// A flat log under each tier: thin, so the bodies behind and under it show (the owner's look, 2026-10-19).
export const LEDGE = { depth: 2.3, thickness: 0.45, halfLength: BOARD.columns * BOARD.spacing / 2 + 0.35 };
// The stairs: a flight from a tier's end square up to the next tier's, bowing out a little past the board's end.
const STAIR = { reach: 0.7, treads: 14, width: 1.6 };
const COLOURS = {
  stone: ['#dcc49a', '#d5bf98', '#d0bf9c', '#cdbf9f', '#dcc6a0'], // a tier each: warm sandstone, a little cooler higher up
  finish: '#f3cd74',
  log: '#7a5a40',
  logMoss: '#6d8c3d',
  shelf: '#8f897b',
  shelfMoss: '#7c9a44',
  stair: '#8d6a48',
  ivy: '#5f8f3e',
  root: '#6e5440',
};

/** A rounded rectangle in x and y, for the blocks' extrusion. */
function roundedRect(width, height, radius) {
  const x = -width / 2, y = -height / 2, s = new THREE.Shape();
  s.moveTo(x + radius, y);
  s.lineTo(x + width - radius, y); s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Paint a geometry one colour (as a vertex colour), so merged parts keep their own. */
function painted(geometry, colour, jitter = 0, random = Math.random) {
  const g = geometry.index ? geometry : geometry;
  const n = g.attributes.position.count;
  const c = new THREE.Color(colour), out = new Float32Array(n * 3), t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    t.copy(c);
    if (jitter) t.offsetHSL(0, 0, (random() - 0.5) * jitter);
    out.set([t.r, t.g, t.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

/** A block: a rounded box with a soft bevel, its top at y 0, centred in x and z, a little uneven. */
function stoneGeometry() {
  const { width, height, depth } = STONE;
  const g = new THREE.ExtrudeGeometry(roundedRect(width - 0.12, height - 0.12, 0.1), {
    depth: depth - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 3,
  });
  g.translate(0, -height / 2, -(depth - 0.12) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // the sides bulge a little and the edges wander, so no two faces read as machined
    p.setX(i, x * (1 + 0.025 * Math.sin(y * 9 + z * 3)));
    p.setY(i, y + (y > -0.05 ? 0.018 * Math.sin(x * 4.1 + z * 2.3) : 0));
  }
  g.computeVertexNormals();
  return g;
}

/** The numbers 1 to 100 on plaques in one texture, 10 across and 10 down, each cell as wide as the plaque; Nunito, the game's face. */
function drawPlaques(starts) {
  const w = 196, h = 140, cols = 10, rows = 10;
  const canvas = document.createElement('canvas');
  canvas.width = w * cols; canvas.height = h * rows;
  const c = canvas.getContext('2d');
  for (let n = 1; n <= BOARD.count; n++) {
    const x = ((n - 1) % cols) * w, y = Math.floor((n - 1) / cols) * h;
    const kind = starts.get(n);
    // a cream plaque with a soft rim, green round a neck's first square, apricot round a tail's, gold on the finish
    c.fillStyle = n === BOARD.count ? '#ffe39a' : '#fbf4e2';
    c.beginPath(); c.roundRect(x + 4, y + 4, w - 8, h - 8, 24); c.fill();
    c.lineWidth = kind ? 12 : 6;
    c.strokeStyle = kind === 'neck' ? '#4fa64c' : kind === 'tail' ? '#e5803c' : n === BOARD.count ? '#d49b2c' : '#c2ad88';
    c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${n >= 100 ? 118 : 146}px Nunito, "Arial Rounded MT Bold", sans-serif`;
    c.lineJoin = 'round';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(255, 252, 240, 0.9)';
    const tx = x + w / 2;
    c.strokeText(String(n), tx, y + h / 2 + 8);
    c.fillStyle = kind === 'neck' ? '#26602b' : kind === 'tail' ? '#9a4316' : '#3d2f20';
    c.fillText(String(n), tx, y + h / 2 + 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, w, h, cols, rows };
}

export function createBoard({ base = 0.5, heightAt = () => 0, shelves = [], renderer = null } = {}) {
  const group = new THREE.Group();
  group.name = 'Board';
  const geometries = [], materials = [], textures = [];
  const own = g => (geometries.push(g), g);
  const ownM = m => (materials.push(m), m);
  const random = seeded(80);

  /** Where a piece stands on square n (the block's top), in the world. */
  function square(n, out = new THREE.Vector3()) {
    const p = squareAt(n);
    return out.set(p.x, p.y + base, p.z);
  }
  const tierY = r => r * BOARD.rowHeight + base;
  const tierZ = r => (r % 2 ? 0 : -BOARD.recess);

  // ---- the blocks ------------------------------------------------------------------------------------------------------
  const stoneMaterial = ownM(new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: false }));
  const stones = new THREE.InstancedMesh(own(stoneGeometry()), stoneMaterial, BOARD.count + 1);
  stones.name = 'Blocks';
  stones.castShadow = false; // on top of the logs: a shadow there would cost the shadow pass for a sliver
  stones.receiveShadow = true;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let n = 0; n <= BOARD.count; n++) {
      square(n, p);
      if (n === 0) p.y = heightAt(p.x, p.z) + 0.32; // the start: a low block on the grass, before square 1
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (random() - 0.5) * 0.05);
      s.set(n === 0 ? 1.15 : 0.98 + random() * 0.04, n === 0 ? 0.7 : 1, 1);
      m.compose(p, q, s);
      stones.setMatrixAt(n, m);
      const tier = n === 0 ? 0 : Math.floor((n - 1) / BOARD.columns);
      const colour = new THREE.Color(n === BOARD.count ? COLOURS.finish : COLOURS.stone[tier]).offsetHSL(0, 0, (random() - 0.5) * 0.05);
      stones.setColorAt(n, colour);
    }
  }
  group.add(stones);

  // ---- the plaques: one mesh, its numbers from one texture ----------------------------------------------------------------
  const starts = new Map(SHORTCUTS.map(s => [s.from, s.type]));
  const plaqueGlow = { attribute: null, now: new Float32Array(BOARD.count) };
  const plaques = drawPlaques(starts);
  textures.push(plaques.texture);
  {
    const [w, h] = STONE.plaque;
    const positions = [], uvs = [], index = [];
    const p = new THREE.Vector3();
    for (let n = 1; n <= BOARD.count; n++) {
      square(n, p);
      const y = p.y - STONE.height * 0.5, z = p.z + STONE.depth / 2 + 0.012, k = positions.length / 3;
      positions.push(p.x - w / 2, y - h / 2, z, p.x + w / 2, y - h / 2, z, p.x + w / 2, y + h / 2, z, p.x - w / 2, y + h / 2, z);
      const { cols, rows } = plaques;
      const cx = (n - 1) % cols, cy = Math.floor((n - 1) / cols);
      const u0 = cx / cols, u1 = (cx + 1) / cols;
      const v0 = 1 - (cy + 1) / rows, v1 = 1 - cy / rows;
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      index.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    const glow = new Float32Array(positions.length / 3);
    g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
    const material = ownM(new THREE.MeshStandardMaterial({ map: plaques.texture, transparent: true, alphaTest: 0.05, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.82, 0.4) * vGlow * 0.9;');
    };
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'Plaques';
    mesh.receiveShadow = true;
    group.add(mesh);
    plaqueGlow.attribute = g.attributes.aGlow;
  }

  // ---- the logs under the tiers, the shelves behind them, the roots and ivy under them ---------------------------------------
  const woodParts = [];
  const L = LEDGE;
  for (let r = 0; r < BOARD.rows; r++) {
    const top = tierY(r) - STONE.height + 0.04, z0 = tierZ(r);
    if (r === 0) continue; // tier 0's blocks lie on the grass
    {
      const x0 = -L.halfLength + 0.35, x1 = L.halfLength - 0.35, length = x1 - x0, cx = 0; // to just past the last blocks
      // a log: a long, slightly wavy cylinder lying along x, flattened
      const log = new THREE.CylinderGeometry(L.thickness * 0.62, L.thickness * 0.66, length, 10, Math.max(2, Math.round(length / 2.6)), false);
      log.rotateZ(Math.PI / 2);
      const lp = log.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const x = lp.getX(i) + cx;
        lp.setY(i, lp.getY(i) * 0.82 + 0.04 * Math.sin(x * 0.4 + r));
        lp.setZ(i, lp.getZ(i) * (L.depth / 2) / (L.thickness * 0.64));
      }
      log.computeVertexNormals();
      log.translate(cx, top - L.thickness * 0.5, z0 - 0.05);
      woodParts.push(painted(log, COLOURS.log, 0.06, random));
      // a moss blanket over the log's top, under the blocks
      const moss = new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      moss.scale(length / 2 + 0.05, 0.1, L.depth / 2 + 0.05);
      moss.translate(cx, top - 0.06, z0 - 0.05);
      woodParts.push(painted(moss, COLOURS.logMoss, 0.08, random));
    }
    // roots and ivy hanging under the log
    for (let k = 0; k < 11; k++) {
      const x = -L.halfLength + 1.5 + k * (2 * L.halfLength - 3) / 10 + (random() - 0.5) * 1.2;
      const length = 0.8 + random() * 1.6;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, top - L.thickness * 0.7, z0 + 0.75),
        new THREE.Vector3(x + 0.25, top - L.thickness * 0.7 - length * 0.5, z0 + 1.05),
        new THREE.Vector3(x - 0.1, top - L.thickness * 0.7 - length, z0 + 0.9),
      ]);
      woodParts.push(painted(new THREE.TubeGeometry(curve, 5, 0.05 + random() * 0.04, 4, false), k % 3 ? COLOURS.ivy : COLOURS.root, 0.1, random));
    }
  }
  // the shelves: a craggy rock behind a tier, flat and mossy on top, where a Þórseðla stands (thorsedla.js stands her 0.3 m
  // under the blocks' tops)
  const rock = [new THREE.Color(COLOURS.shelf), new THREE.Color('#a39d8f'), new THREE.Color('#6f6a60')];
  const mossColour = new THREE.Color(COLOURS.shelfMoss), mossDeep = new THREE.Color('#5f7f36');
  for (const s of shelves) {
    if (s.tier === 0) continue;
    const yTop = tierY(s.tier) - 0.3 - (s.drop ?? 0), thick = 1.5;
    const w = s.x1 - s.x0, d = s.z1 - s.z0; // no wider than asked: necks and tails pass close by its edges
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const g = new THREE.BoxGeometry(w, thick, d, 14, 3, 8);
    const pos = g.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const seed = s.x0 * 1.7 + s.tier * 3.1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ex = Math.abs(x) / (w / 2), ez = Math.abs(z) / (d / 2);
      const edge = Math.max(ex, ez); // 1 on the rim
      const n1 = Math.sin(x * 1.3 + seed) * Math.cos(z * 1.7 - seed) , n2 = Math.sin(x * 3.1 + z * 2.3 + seed * 2);
      let px = x, py = y, pz = z;
      if (y > thick / 2 - 0.01) {
        // the top: flat where she stands, rounding down to the rim
        py = thick / 2 - 0.32 * Math.max(0, edge - 0.82) / 0.18 + 0.03 * n2 * (1 - edge);
      } else if (y < -thick / 2 + 0.01) {
        // the underside: crags hanging down, deepest in the middle
        py = -thick / 2 - (0.25 + 0.55 * Math.abs(n1) + 0.25 * Math.abs(n2)) * (1 - edge * 0.6);
      }
      // the sides wander in and out
      const out = 1 - 0.04 * Math.abs(n2) - 0.04 * Math.abs(n1); // in, never out
      if (ex > 0.98) px = x * out;
      if (ez > 0.98) pz = z * out;
      // turned about y round its middle when its place is turned (shelfFor's angle)
      const ca = Math.cos(s.angle ?? 0), sa = Math.sin(s.angle ?? 0);
      pos.setXYZ(i, cx + px * ca + pz * sa, py + yTop - thick / 2, cz - px * sa + pz * ca);
      const top = py > thick / 2 - 0.12;
      if (top) c.copy(mossColour).lerp(mossDeep, 0.5 + 0.5 * n2);
      else c.copy(rock[0]).lerp(rock[n1 > 0 ? 1 : 2], Math.abs(n1) * 0.7).multiplyScalar(0.95 + 0.1 * n2);
      colours.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    g.computeVertexNormals();
    woodParts.push(g);
    // moss and roots hanging from its front edge
    for (let k = 0; k < 5; k++) {
      const x = s.x0 + (k + 0.5) * (s.x1 - s.x0) / 5 + (random() - 0.5) * 0.8, z = s.z1 + 0.15;
      const length = 0.6 + random() * 1.4;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, yTop - 0.2, z), new THREE.Vector3(x + 0.2, yTop - 0.2 - length * 0.5, z + 0.15), new THREE.Vector3(x - 0.1, yTop - 0.2 - length, z + 0.05)]);
      woodParts.push(painted(new THREE.TubeGeometry(curve, 5, 0.05, 4, false), k % 2 ? COLOURS.ivy : COLOURS.root, 0.1, random));
    }
  }

  // ---- the stairs between the tiers: a flight from one tier's end square to the next one's, bowing out past the end --------
  const stairs = new Map();
  for (let r = 0; r < BOARD.rows - 1; r++) {
    const from = (r + 1) * BOARD.columns, to = from + 1;
    // from the front or back edge of one end block to the edge of the next (a giant's head rests on those blocks' tops)
    const a = square(from), b = square(to), dz = Math.sign(b.z - a.z);
    a.z += dz * (STONE.depth / 2 - 0.15); b.z -= dz * (STONE.depth / 2 - 0.15);
    const side = r % 2 === 0 ? 1 : -1;
    const point = (u, out = new THREE.Vector3()) => out.set(
      a.x + side * Math.sin(Math.PI * u) * STAIR.reach,
      a.y + (b.y - a.y) * u,
      a.z + (b.z - a.z) * u,
    );
    let length = 0;
    const prev = point(0), here = new THREE.Vector3();
    for (let i = 1; i <= 32; i++) { point(i / 32, here); length += here.distanceTo(prev); prev.copy(here); }
    stairs.set(from, { from, to, point, length, side });
    // the treads: planks across the flight, two root stringers under their ends, and a twisted root rail on the outside
    const climb = Math.atan2(b.y - a.y, Math.abs(b.z - a.z));
    for (let k = 1; k < STAIR.treads; k++) {
      const p = point(k / STAIR.treads);
      const plank = new THREE.BoxGeometry(STAIR.width, 0.14, 0.62);
      plank.rotateY((random() - 0.5) * 0.08);
      plank.translate(p.x, p.y - 0.07, p.z);
      woodParts.push(painted(plank, COLOURS.stair, 0.08, random));
    }
    for (const edge of [-1, 1]) {
      const beam = [];
      for (let k = 0; k <= 8; k++) beam.push(point(k / 8).add(new THREE.Vector3(edge * STAIR.width * 0.45, -0.35, 0)));
      woodParts.push(painted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beam), 16, 0.13, 6, false), COLOURS.root, 0.05, random));
    }
    const rail = [];
    for (let k = 0; k <= 10; k++) {
      const p = point(k / 10);
      rail.push(new THREE.Vector3(p.x + side * STAIR.width * 0.5, p.y + 0.9, p.z));
    }
    woodParts.push(painted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 20, 0.07, 5, false), COLOURS.root, 0.05, random));
    for (let k = 1; k < 10; k += 2) {
      const p = rail[k];
      const post = new THREE.CylinderGeometry(0.05, 0.06, 0.95, 5);
      post.translate(p.x, p.y - 0.47, p.z);
      woodParts.push(painted(post, COLOURS.root, 0.05, random));
    }
    void climb;
  }

  // ---- the finish: a flag on a pole behind the last square ---------------------------------------------------------------
  {
    const p = square(BOARD.count);
    const x = p.x + 0.75, z = p.z - 0.75;
    const pole = new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6);
    pole.translate(x, p.y + 1.7, z);
    woodParts.push(painted(pole, '#7a5a40', 0, random));
    const knob = new THREE.SphereGeometry(0.14, 8, 6);
    knob.translate(x, p.y + 3.45, z);
    woodParts.push(painted(knob, '#f2c443', 0, random));
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(-1.6, -0.18); shape.lineTo(-1.2, -0.55); shape.lineTo(-1.6, -0.92); shape.lineTo(0, -0.8); shape.closePath();
    const flag = new THREE.ShapeGeometry(shape);
    flag.translate(x - 0.05, p.y + 3.3, z + 0.01);
    woodParts.push(painted(flag, '#ef8a5a', 0, random));
  }

  const woodGeometry = own(mergeGeometries(woodParts.map(g => (g.index ? g.toNonIndexed() : g)).map(g => {
    // mergeGeometries needs matching attributes: position, normal, color (uv dropped)
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    return g;
  })));
  woodParts.forEach(g => g.dispose());
  const woodMaterial = ownM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
  const wood = new THREE.Mesh(woodGeometry, woodMaterial);
  wood.name = 'Logs, shelves and stairs';
  wood.castShadow = true;
  wood.receiveShadow = true;
  group.add(wood);

  // ---- the adventure's marks: one mesh for their stems, mud and fossils, one for the fireflies' glowing bulbs ---------------
  const marks = new THREE.Group();
  marks.name = 'Adventure marks';
  group.add(marks);
  const markMaterial = ownM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 }));
  const bulbMaterial = ownM(new THREE.MeshStandardMaterial({ color: '#fff0a8', emissive: '#ffd860', emissiveIntensity: 2.2, roughness: 0.5 }));
  const bulbGeometry = own(new THREE.SphereGeometry(0.1, 10, 8));
  let bulbs = null, bulbSpots = [], markMesh = null;
  function decorate(events = []) {
    if (markMesh) { markMesh.geometry.dispose(); marks.remove(markMesh); markMesh = null; }
    if (bulbs) { bulbs.dispose(); marks.remove(bulbs); bulbs = null; }
    bulbSpots = [];
    const parts = [];
    const part = (geometry, colour, at, scale, rotZ = 0) => {
      if (scale) geometry.scale(...scale);
      if (rotZ) geometry.rotateZ(rotZ);
      geometry.translate(...at);
      parts.push(painted(geometry.index ? geometry.toNonIndexed() : geometry, colour));
    };
    for (const event of events) {
      const p = square(event.from);
      const x = p.x + 0.62, y = p.y, z = p.z - 0.55;
      if (event.type === 'firefly') {
        for (let i = 0; i < 3; i++) {
          const h = 0.42 + i * 0.13, dx = (i - 1) * 0.18;
          part(new THREE.CylinderGeometry(0.025, 0.035, h, 5), '#6f9a4a', [x + dx, y + h / 2, z]);
          bulbSpots.push({ x: x + dx, y: y + h, z, phase: i + event.from });
        }
      } else if (event.type === 'mud') {
        part(new THREE.SphereGeometry(1, 18, 8), '#6b5238', [p.x, y, p.z + 0.2], [0.82, 0.05, 0.62]);
      } else if (event.type === 'fossil') {
        part(new THREE.SphereGeometry(1, 14, 10), '#cdb58a', [x, y + 0.24, z], [0.34, 0.3, 0.17], -0.18);
        const spiral = Array.from({ length: 40 }, (_, i) => { const t = i / 39, a = t * Math.PI * 4.6, r = 0.02 + t * 0.2; return new THREE.Vector3(x + Math.cos(a) * r, y + 0.25 + Math.sin(a) * r, z + 0.16); });
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiral), 40, 0.022, 5, false), '#e6c77a', [0, 0, 0]);
      }
    }
    if (parts.length) {
      for (const g of parts) for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
      markMesh = new THREE.Mesh(mergeGeometries(parts), markMaterial);
      parts.forEach(g => g.dispose());
      markMesh.name = 'Adventure marks';
      markMesh.receiveShadow = true;
      marks.add(markMesh);
    }
    if (bulbSpots.length) {
      bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, bulbSpots.length);
      bulbs.name = 'Firefly bulbs';
      bulbs.frustumCulled = false;
      marks.add(bulbs);
      placeBulbs(0);
    }
  }
  const bulbMatrix = new THREE.Matrix4(), bulbScale = new THREE.Vector3(1, 1.3, 1), bulbQ = new THREE.Quaternion(), bulbAt = new THREE.Vector3();
  function placeBulbs(t) {
    if (!bulbs) return;
    bulbSpots.forEach((b, i) => {
      bulbAt.set(b.x, b.y + Math.sin(t * 1.4 + b.phase) * 0.03, b.z);
      bulbs.setMatrixAt(i, bulbMatrix.compose(bulbAt, bulbQ, bulbScale));
    });
    bulbs.instanceMatrix.needsUpdate = true;
  }

  // ---- glowing plaques --------------------------------------------------------------------------------------------------
  function glow(n, strength = 1) {
    if (n < 1 || n > BOARD.count) return;
    plaqueGlow.now[n - 1] = Math.max(plaqueGlow.now[n - 1], strength);
  }
  let time = 0;
  function update(dt) {
    time += dt;
    let dirty = false;
    const a = plaqueGlow.attribute;
    for (let i = 0; i < BOARD.count; i++) {
      const v = plaqueGlow.now[i];
      if (v <= 0 && a.array[i * 4] === 0) continue;
      const next = Math.max(0, v - dt * 0.9);
      plaqueGlow.now[i] = next;
      for (let k = 0; k < 4; k++) a.array[i * 4 + k] = next;
      dirty = true;
    }
    if (dirty) a.needsUpdate = true;
    placeBulbs(time);
  }

  return {
    group, square, stairs: n => stairs.get(n) ?? null, decorate, glow, update, tierY, tierZ,
    dispose() {
      group.removeFromParent();
      stones.dispose();
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
    },
  };
}
