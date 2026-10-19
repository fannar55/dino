import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { BOARD, SHORTCUTS, tilePosition } from './rules.js';

// The board of "Háls og hali" in the world (spec sections 3 and 4): Codex's 80 squares on five tiers of 16, seen from the side,
// at Codex's own measures (rules.js: 2.3 m from square to square, 5.5 m from tier to tier), in metres. Each tier is a mossy log
// with sixteen sandstone blocks on it, each block with its number on a plaque on the face toward the camera. The ends of the
// tiers are joined by wooden stairs that bow out past the ends (16 to 17, 32 to 33, 48 to 49, 64 to 65), Codex's stairs. Two
// old trees hold the logs at the ends, and roots and ivy hang under them. Behind a tier, a mossy rock shelf carries the
// Þórseðla who stands there (thorsedla.js), at the tier's height.
//
//   const board = createBoard({ base, heightAt, shelves })
//   board.group                       everything, to add to the scene
//   board.square(n, out)              where a piece stands on square n: the middle of the block's top (n 0: the start, before 1)
//   board.stairs(n)                   the stairs from square n up to n + 1, or null: { from, to, point(u, out), length }
//   board.decorate(events)            the adventure's marks on their squares (rules.js SPECIAL_TILES), or [] for none
//   board.glow(n, colour)             square n's plaque lights up and fades (a landing, a count)
//   board.update(dt)
//   board.dispose()
//
// `base` is the height of tier 0's block tops over the ground at the board, `heightAt` the forest's ground, `shelves` the rock
// shelves to put behind the tiers: [{ tier, x0, x1, z0, z1 }] (the Þórseðlas' places, thorsedla.js's shelfFor).

export const STONE = { width: 2.02, height: 0.5, depth: 2.0, plaque: [1.36, 0.42] };
export const LEDGE = { depth: 2.5, thickness: 1.0, halfLength: BOARD.columns * BOARD.spacing / 2 + 0.35 };
const STAIR = { reach: 3.3, treads: 13 };
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

/** The numbers 1 to 80 on plaques in one texture, 8 across and 10 down; Nunito, the game's face (STYLE.md). */
function drawPlaques(starts) {
  const cell = 128, cols = 8, rows = 10;
  const canvas = document.createElement('canvas');
  canvas.width = cell * cols; canvas.height = cell * rows;
  const c = canvas.getContext('2d');
  for (let n = 1; n <= BOARD.count; n++) {
    const x = ((n - 1) % cols) * cell, y = Math.floor((n - 1) / cols) * cell;
    const kind = starts.get(n);
    // a cream plaque with a soft rim, green round a neck's first square, apricot round a tail's, gold on the finish
    c.fillStyle = n === BOARD.count ? '#ffe7a8' : '#f7efd9';
    c.beginPath(); c.roundRect(x + 6, y + 22, cell - 12, cell - 44, 22); c.fill();
    c.lineWidth = kind ? 9 : 4;
    c.strokeStyle = kind === 'neck' ? '#5fae5a' : kind === 'tail' ? '#e58c4a' : n === BOARD.count ? '#d49b2c' : '#b9a786';
    c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 70px Nunito, "Arial Rounded MT Bold", sans-serif';
    c.fillStyle = kind === 'neck' ? '#2f6b34' : kind === 'tail' ? '#a1501f' : '#4a3a28';
    c.fillText(String(n), x + cell / 2, y + cell / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, cell, cols, rows };
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
    const p = tilePosition(n);
    return out.set(p.x, p.y + base, 0);
  }
  const tierY = r => r * BOARD.rowHeight + base;

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
      if (n === 0) p.y = heightAt(p.x, 0) + 0.32; // the start: a low block on the grass, before square 1
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
      const y = p.y - STONE.height * 0.5, z = STONE.depth / 2 + 0.012, k = positions.length / 3;
      positions.push(p.x - w / 2, y - h / 2, z, p.x + w / 2, y - h / 2, z, p.x + w / 2, y + h / 2, z, p.x - w / 2, y + h / 2, z);
      const { cell, cols, rows } = plaques;
      const cx = (n - 1) % cols, cy = Math.floor((n - 1) / cols);
      // the cell's plaque only (the texture leaves a margin above and below it)
      const u0 = cx / cols, u1 = (cx + 1) / cols;
      const v0 = 1 - (cy * cell + cell - 20) / (rows * cell), v1 = 1 - (cy * cell + 20) / (rows * cell);
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
    const top = tierY(r) - STONE.height + 0.04;
    if (r === 0) continue; // tier 0's blocks lie on the grass
    // a log: a long, slightly wavy cylinder lying along x
    const log = new THREE.CylinderGeometry(L.thickness * 0.62, L.thickness * 0.66, L.halfLength * 2 + 1.2, 10, 14, false);
    log.rotateZ(Math.PI / 2);
    const lp = log.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i);
      lp.setY(i, lp.getY(i) * 0.82 + 0.06 * Math.sin(x * 0.4 + r));
      lp.setZ(i, lp.getZ(i) * 1.55);
    }
    log.computeVertexNormals();
    log.translate(0, top - L.thickness * 0.5, -0.05);
    woodParts.push(painted(log, COLOURS.log, 0.06, random));
    // a moss blanket over the log's top, under the blocks
    const moss = new THREE.SphereGeometry(1, 18, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    moss.scale(L.halfLength + 0.5, 0.12, 1.4);
    moss.translate(0, top - 0.06, -0.05);
    woodParts.push(painted(moss, COLOURS.logMoss, 0.08, random));
    // roots and ivy hanging under the log
    for (let k = 0; k < 9; k++) {
      const x = -L.halfLength + 1.5 + k * (2 * L.halfLength - 3) / 8 + (random() - 0.5) * 1.2;
      const length = 0.8 + random() * 1.6;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, top - L.thickness * 0.7, 0.6),
        new THREE.Vector3(x + 0.25, top - L.thickness * 0.7 - length * 0.5, 0.9),
        new THREE.Vector3(x - 0.1, top - L.thickness * 0.7 - length, 0.75),
      ]);
      woodParts.push(painted(new THREE.TubeGeometry(curve, 5, 0.05 + random() * 0.04, 4, false), k % 3 ? COLOURS.ivy : COLOURS.root, 0.1, random));
    }
  }
  // the shelves: a rounded mossy rock slab behind a tier, where a Þórseðla stands
  for (const s of shelves) {
    if (s.tier === 0) continue;
    const top = tierY(s.tier) - STONE.height - 0.05;
    const w = s.x1 - s.x0, d = s.z1 - s.z0;
    const slab = new THREE.ExtrudeGeometry(roundedRect(w, d, Math.min(1.4, d / 3)), { depth: 0.9, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.3, bevelSegments: 3, curveSegments: 6 });
    slab.rotateX(Math.PI / 2);
    slab.translate((s.x0 + s.x1) / 2, top, (s.z0 + s.z1) / 2);
    const sp = slab.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) + (sp.getY(i) < top - 0.5 ? -0.35 * Math.abs(Math.sin(sp.getX(i) * 0.9 + sp.getZ(i))) : 0));
    slab.computeVertexNormals();
    woodParts.push(painted(slab, COLOURS.shelf, 0.07, random));
    const moss = new THREE.SphereGeometry(1, 20, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    moss.scale(w / 2 + 0.1, 0.1, d / 2 + 0.1);
    moss.translate((s.x0 + s.x1) / 2, top + 0.24, (s.z0 + s.z1) / 2);
    woodParts.push(painted(moss, COLOURS.shelfMoss, 0.08, random));
  }

  // ---- the stairs between the tiers -------------------------------------------------------------------------------------
  const stairs = new Map();
  for (let r = 0; r < BOARD.rows - 1; r++) {
    const from = (r + 1) * BOARD.columns, to = from + 1;
    const a = square(from), b = square(to);
    const side = r % 2 === 0 ? 1 : -1;
    const point = (u, out = new THREE.Vector3()) => out.set(
      a.x + side * Math.sin(Math.PI * u) * STAIR.reach,
      a.y + (b.y - a.y) * u,
      0.15 * Math.sin(Math.PI * u),
    );
    let length = 0;
    const prev = point(0), here = new THREE.Vector3();
    for (let i = 1; i <= 32; i++) { point(i / 32, here); length += here.distanceTo(prev); prev.copy(here); }
    stairs.set(from, { from, to, point, length, side });
    // the treads: planks on the curve, and a twisted root rail on the outside
    for (let k = 1; k < STAIR.treads; k++) {
      const u = k / STAIR.treads;
      const p = point(u);
      const tangent = point(Math.min(1, u + 0.01)).sub(point(Math.max(0, u - 0.01)));
      const plank = new THREE.BoxGeometry(1.0, 0.16, 1.9);
      plank.rotateY(Math.atan2(-tangent.z, tangent.x) * 0 + (random() - 0.5) * 0.08);
      plank.translate(p.x, p.y - 0.08, p.z);
      woodParts.push(painted(plank, COLOURS.stair, 0.08, random));
    }
    const rail = [];
    for (let k = 0; k <= 10; k++) {
      const p = point(k / 10);
      rail.push(new THREE.Vector3(p.x + side * 0.55 * Math.sin(Math.PI * k / 10), p.y + 0.9, p.z - 0.85));
    }
    woodParts.push(painted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 20, 0.07, 5, false), COLOURS.root, 0.05, random));
    for (let k = 1; k < 10; k += 2) {
      const p = rail[k];
      const post = new THREE.CylinderGeometry(0.05, 0.06, 0.95, 5);
      post.translate(p.x, p.y - 0.47, p.z);
      woodParts.push(painted(post, COLOURS.root, 0.05, random));
    }
  }

  // ---- the two old trees that hold the logs at the ends -------------------------------------------------------------------
  for (const side of [-1, 1]) {
    const x = side * (LEDGE.halfLength + STAIR.reach + 3.2), z = -2.6;
    const ground = heightAt(x, z);
    const height = tierY(BOARD.rows - 1) + 9 - ground;
    const trunk = new THREE.CylinderGeometry(1.55, 2.5, height, 14, 12, true);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i), angle = Math.atan2(tp.getZ(i), tp.getX(i));
      const flare = 1 + 0.55 * Math.max(0, -(y / height) - 0.38) * 2.2 * (0.6 + 0.4 * Math.sin(angle * 5));
      const bark = 1 + 0.04 * Math.sin(angle * 11 + y * 0.6);
      tp.setX(i, tp.getX(i) * flare * bark + 0.35 * Math.sin(y * 0.12));
      tp.setZ(i, tp.getZ(i) * flare * bark);
    }
    trunk.computeVertexNormals();
    trunk.translate(x, ground + height / 2 - 0.4, z);
    woodParts.push(painted(trunk, '#6e5440', 0.08, random));
    // a bough under each log's end on this side
    for (let r = 1; r < BOARD.rows; r++) {
      const y = tierY(r) - STONE.height - LEDGE.thickness * 0.6;
      const reach = Math.abs(x) - LEDGE.halfLength + 1.2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, y - 1.6, z),
        new THREE.Vector3(x - side * reach * 0.5, y - 0.9, z + 1.0),
        new THREE.Vector3(side * (LEDGE.halfLength - 0.6), y - 0.15, -0.1),
      ]);
      woodParts.push(painted(new THREE.TubeGeometry(curve, 10, 0.55, 7, false), '#6e5440', 0.08, random));
    }
  }

  const woodGeometry = own(mergeGeometries(woodParts.map(g => (g.index ? g.toNonIndexed() : g)).map(g => {
    // mergeGeometries needs matching attributes: position, normal, color (uv dropped)
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    return g;
  })));
  woodParts.forEach(g => g.dispose());
  const woodMaterial = ownM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
  const wood = new THREE.Mesh(woodGeometry, woodMaterial);
  wood.name = 'Logs, shelves, stairs and trees';
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
      const x = p.x + 0.62, y = p.y, z = -0.55;
      if (event.type === 'firefly') {
        for (let i = 0; i < 3; i++) {
          const h = 0.42 + i * 0.13, dx = (i - 1) * 0.18;
          part(new THREE.CylinderGeometry(0.025, 0.035, h, 5), '#6f9a4a', [x + dx, y + h / 2, z]);
          bulbSpots.push({ x: x + dx, y: y + h, z, phase: i + event.from });
        }
      } else if (event.type === 'mud') {
        part(new THREE.SphereGeometry(1, 18, 8), '#6b5238', [p.x, y, 0.2], [0.82, 0.05, 0.62]);
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
    group, square, stairs: n => stairs.get(n) ?? null, decorate, glow, update, tierY,
    dispose() {
      group.removeFromParent();
      stones.dispose();
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
    },
  };
}
