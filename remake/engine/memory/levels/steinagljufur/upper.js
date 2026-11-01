import * as THREE from 'three';
import { GLTFLoader } from '../../../../../dist/vendor/GLTFLoader.js';
import { groundAt, LEDGE, CLIMB, RIM, WALL, wayPoints } from './upper-ground.js';
import { BORE, darkInside } from './props.js';

/**
 * The upper gorge: what lies beyond the tunnel (levels/steinagljufur.js steps `through`, `reach`, `fly` and `climb`). A floor in front of the tunnel's exit, the high ledge (a step
 * too high to walk up) with the slab on it that the Þórseðlur pull down into a ramp, the steep path up the cliff with the tree on the rim that the rope is wrapped round, and the clifftop
 * with room for the dead trunk and the gap (Task 6). The shape of the ground is upper-ground.js; this makes it a mesh and stands the owner's approved models on it: the sandstone cliff
 * pieces (YadroGames, CC BY) and boulders (Quaternius, CC0) of the glade's walls, a second instance of the tunnel (the owner's own) as its exit, the slab (Kenney, CC0) and the tree
 * (Quaternius, CC0). Nothing here is drawn or modelled by hand: it places, scales, tints and tilts them, and the ground's mesh is a surface over the function that says how high it is.
 *
 * It stands far from the glade (the world's walks and camera never see the glade from here), in its own frame: x forward along the gorge, z to the right, y up (the frame is a group, so
 * everything below is told in it; `world()`, `heightAt()` and `yawOf()` turn it into the scene's). It is hidden until the group goes through the tunnel (`show()`), so the glade's search
 * view pays nothing for it.
 */
const FILES = ['gorge-slab', 'gorge-tree'];
const url = name => new URL(`../../../../assets/memory/bord2/${name}.glb`, import.meta.url).href;
// Far from the glade, in the direction the glade's sun shines along (from behind the group looking forward), so that the cliff faces the cameras see are lit.
export const UPPER = Object.freeze({ origin: Object.freeze([-165, -286]), yaw: 2 * Math.PI / 3 });
const seeded = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The meshes of a model as plain float geometry in the model's own frame (the node's scale applied), with the materials the file has. No texture coordinates are needed: these two have none. */
function bakeAll(scene) {
  scene.updateMatrixWorld(true);
  const out = [];
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const source = mesh.geometry, matrix = mesh.matrixWorld, normal = new THREE.Matrix3().getNormalMatrix(matrix), count = source.attributes.position.count;
    const position = new Float32Array(count * 3), normals = new Float32Array(count * 3), v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(source.attributes.position, i).applyMatrix4(matrix).toArray(position, i * 3);
      v.fromBufferAttribute(source.attributes.normal, i).applyMatrix3(normal).normalize().toArray(normals, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(source.index.array), 1)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    out.push({ geometry, material: mesh.material, triangles: source.index.count / 3 });
  });
  return out;
}

/** Reads the slab and the tree: { slab: [part], tree: [part] } (the tree has two: its wood and its crown). */
export async function loadUpperModels() {
  const loader = new GLTFLoader();
  const [slab, tree] = await Promise.all(FILES.map(async name => bakeAll((await loader.loadAsync(url(name))).scene)));
  return { slab, tree };
}

/**
 * Stands the upper gorge. `models` are the glade's (props.js loadGorgeModels: cliff pieces, boulders, the tunnel), `upperModels` the slab and the tree, `glow` the tunnel's light (the exit is
 * the same dark-lined bore). Returns { group, heightAt, world, yawOf, show, hide, slab, tree, anchors, stats, dispose }.
 */
export function createUpperGorge({ scene, models, upperModels, glow }) {
  const frame = new THREE.Group(); frame.name = 'Efra gljúfrið'; frame.position.set(UPPER.origin[0], 0, UPPER.origin[1]); frame.rotation.y = UPPER.yaw; frame.visible = false; scene.add(frame);
  frame.updateMatrixWorld(true);
  const random = seeded(20261101), range = (a, b) => a + (b - a) * random();
  const disposables = [], dummy = new THREE.Object3D();
  let triangles = 0, draws = 0;
  const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.quaternion), ez = new THREE.Vector3(0, 0, 1).applyQuaternion(frame.quaternion), inverse = frame.matrixWorld.clone().invert();

  // ---- the frame's own and the scene's ----
  /** A point of the upper gorge's frame in the scene. */
  const world = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(frame.matrixWorld);
  /** A direction of the frame (dx forward, dz to the right) in the scene, horizontal. */
  const direction = (dx, dz) => ex.clone().multiplyScalar(dx).addScaledVector(ez, dz);
  /** The yaw (rotation.y) of a friend that faces the frame's direction (dx, dz). */
  const yawOf = (dx, dz) => { const d = direction(dx, dz); return Math.atan2(-d.z, d.x); };
  /** The frame's coordinates of a point of the scene. */
  const local = point => point.clone().applyMatrix4(inverse);
  /** The height of the ground at a point of the scene (the frame's height is the scene's: the frame only turns and moves on the ground plane). */
  const heightAt = (wx, wz) => { const p = local(new THREE.Vector3(wx, 0, wz)); return groundAt(p.x, p.z); };
  const onGround = (x, z, rise = 0) => new THREE.Vector3(x, groundAt(x, z) + rise, z);

  // ---- the plain and the ground ----
  const plainMaterial = new THREE.MeshStandardMaterial({ color: '#cdac7e', roughness: 1, metalness: 0 }); disposables.push(plainMaterial);
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), plainMaterial); plain.geometry.rotateX(-Math.PI / 2); plain.position.set(20, -.06, 0); plain.receiveShadow = true; plain.name = 'Slétta'; frame.add(plain);
  disposables.push(plain.geometry); triangles += 2; draws++;

  // The ground's mesh: a grid laid over groundAt, finer across the ledge's riser (its face is steep), coloured by how steep each place is (sand on the flat, rock on a face).
  const xs = [], zs = [];
  for (let x = -40; x <= 52; x += x > 2 && x < 4.4 ? .1 : x > 1.4 && x < 5 ? .3 : .9) xs.push(+x.toFixed(2));
  for (let z = -16; z <= 31; z += .9) zs.push(+z.toFixed(2));
  const cols = xs.length, rows = zs.length, position = new Float32Array(cols * rows * 3), normal = new Float32Array(cols * rows * 3), colour = new Float32Array(cols * rows * 3);
  const SAND = new THREE.Color('#c4965a'), ROCK = new THREE.Color('#9b4318'), DEEP = new THREE.Color('#7a3010'), tint = new THREE.Color(), e = .25;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = xs[i], z = zs[j], y = groundAt(x, z), k = j * cols + i;
    const nx = groundAt(x - e, z) - groundAt(x + e, z), nz = groundAt(x, z - e) - groundAt(x, z + e), l = Math.hypot(nx, 2 * e, nz);
    position.set([x, y, z], k * 3); normal.set([nx / l, 2 * e / l, nz / l], k * 3);
    const steep = smoothstep(.03, .22, 1 - 2 * e / l), shade = 1 + (random() - .5) * .03;
    tint.copy(SAND).lerp(ROCK, steep).lerp(DEEP, smoothstep(.35, .7, 1 - 2 * e / l) * .7).multiplyScalar(shade); colour.set([tint.r, tint.g, tint.b], k * 3);
  }
  const index = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    // (nothing is drawn where the plain is level with the ground: the plain is there)
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    if (position[a * 3 + 1] + position[b * 3 + 1] + position[c * 3 + 1] + position[d * 3 + 1] < .02) continue;
    index.push(a, c, b, b, c, d);
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3)); terrainGeometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3)); terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  terrainGeometry.setIndex(index); terrainGeometry.computeBoundingSphere();
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0 }); disposables.push(terrainGeometry, terrainMaterial);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial); terrain.name = 'Efra gljúfrið (jörð)'; terrain.receiveShadow = true; terrain.frustumCulled = false; frame.add(terrain);
  triangles += index.length / 3; draws++;

  // ---- the cliff pieces and boulders ----
  // Placed on the faces of the ground: a piece's middle goes where the ground has risen (or fallen) so many metres from the floor of the place, found by walking outward from it; it is
  // sunk into the face so that it grows out of it. The hillside (+z) is the backdrop of every shot, so it is dressed deepest; the open side (-z) is where the cameras stand and is dressed
  // along the faces under the path and the rim, so that they are rock, not a smooth slope; the back and the end are walls of pieces.
  const placements = new Map();
  const add = (name, entry) => { if (!placements.has(name)) placements.set(name, []); placements.get(name).push(entry); };
  const piece = (kinds, x, z, y, scale, sink) => add(`gorge-cliff-${kinds[Math.floor(random() * kinds.length) % kinds.length]}`, { x, z, y: y - sink * scale, yaw: range(0, Math.PI * 2), scale, tilt: range(-.05, .05), tint: .88 + .16 * random() });
  const way = wayPoints(1), nearest = x => way.reduce((best, p) => Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best);
  const rimZ = x => RIM.from[1] + (RIM.to[1] - RIM.from[1]) * (x - RIM.from[0]) / (RIM.to[0] - RIM.from[0]);
  // where the middle of the place is at x: [z, y] (the exit floor and the terrace, the path, the rim)
  const middleAt = x => x < 9.5 ? [x < LEDGE.x ? 0 : -1, groundAt(x, 0)] : x < RIM.from[0] ? [nearest(x)[1], nearest(x)[2]] : [rimZ(x), RIM.y];
  const EXIT = { mouth: -12 }, BORE_BOX = { minX: -32, maxX: EXIT.mouth + 2.5, halfZ: 4.6 };
  const bores = (x, z) => x < BORE_BOX.maxX && x > BORE_BOX.minX && Math.abs(z) < BORE_BOX.halfZ;
  const ALL = [0, 3, 4, 5, 6, 1, 2];
  // the hillside (+z): two rows, the lower at the foot and the upper high on the face
  for (let x = -30; x <= 50; x += range(4.6, 6.4)) {
    const [z0, y0] = middleAt(Math.min(x, RIM.to[0])), reach = x > 9.5 && x < RIM.from[0] ? 1.5 : 0;
    for (const [rise, scale, sink] of [[2.2, range(2.4, 3.1), .5], [6.2, range(3.1, 4), .55]]) {
      let z = null; for (let k = 0; k < 90 && z === null; k++) if (groundAt(x, z0 + reach + k * .5) >= y0 + rise) z = z0 + reach + k * .5;
      if (z !== null) piece(ALL, x + range(-1.2, 1.2), z + .5, groundAt(x, z), scale, sink);
    }
  }
  // the back of the exit floor: a wall of pieces behind the tunnel, two rows
  for (const [x, scale] of [[-22, 3.6], [-18.8, 3.0]]) for (let z = -13; z <= 9; z += range(4.4, 5.6)) { if (bores(x, z) && x > -24) continue; piece(ALL, x + range(-.8, .8), z, 0, scale * range(.9, 1.15), .5); }
  // the end beyond the rim (Task 6's gap is in front of it)
  for (let z = -4; z <= 16; z += range(4.2, 5.6)) piece([4, 6, 0, 5], RIM.to[0] + 9.2, z, groundAt(RIM.to[0] + 9.2, z), range(3, 3.9), .55);
  // the open side (-z): under the terrace, the path and the rim, walking out from the edge of the flat until the ground has fallen: a row at each of the drops
  function dressOpen(x0, x1, gap, edgeOf, drops, scales) {
    for (let x = x0; x <= x1; x += gap * range(.85, 1.2)) {
      const [ez, y0] = edgeOf(x);
      drops.forEach((drop, row) => { for (let k = 0; k < 80; k++) { const z = ez - k * .4; if (groundAt(x, z) <= y0 - drop) { piece(ALL, x + range(-.7, .7), z + .5, groundAt(x, z), range(...scales[row]), .62); break; } } });
    }
  }
  dressOpen(3.6, 9, 4.4, () => [-8.5, LEDGE.height], [.8], [[1.1, 1.5]]);
  dressOpen(10.5, 25, 4.2, x => { const [z, y] = nearest(x); return [z - 2.3, y]; }, [2.6, 5], [[1.1, 1.6], [1.5, 2.1]]);
  dressOpen(26, 40, 5, x => [rimZ(x) - RIM.hw + 1, RIM.y], [2.4, 5.6], [[1.3, 1.9], [1.8, 2.5]]);
  // the ledge's riser: pieces along it at each side of the middle, which is left clear for the slab
  for (const z of [-10.4, -8, -5.8, -3.9, 4, 6, 8, 10]) piece([4, 6, 5, 3], LEDGE.x - .2 + range(-.2, .3), z, groundAt(LEDGE.x - .2, z), range(1.3, 1.9), .4);
  // boulders at the foot of the riser, along the hillside and at the edge of the path (the rope's stake is one)
  for (const [x, z, kind, scale] of [[1.4, 5.9, 1, .5], [1.9, 8.4, 2, .42], [1.5, -6.2, 1, .46], [2, -8.6, 2, .36], [5.2, -9.6, 1, .5], [-12, 3.2, 1, .5], [-5, 3.8, 2, .4], [-18, 3.4, 2, .4], [5.6, 4.6, 1, .46], [11.4, 3.2, 2, .36], [15.6, 6.8, 1, .38], [-10.2, -6.8, 2, .3], [-3.8, -8, 1, .34], [-17, -7, 1, .4], [17.8, 4.4, 2, .3]]) add(`gorge-boulder-${kind}`, { x, z, y: groundAt(x, z) - .16 * scale, yaw: range(0, Math.PI * 2), scale, tilt: 0, tint: .9 + .15 * random() });

  const warm = new THREE.Color('#e8d3be');
  // (each kind in chunks along the gorge, a mesh each, so that the frustum drops the stretches a view does not see: the budget's 250,000 triangles are for what is drawn)
  const CHUNKS = [-1e9, -8, 11, 27, 1e9];
  for (const [name, all] of placements) {
    const model = models.get(name), material = model.material.clone(); material.side = THREE.FrontSide; disposables.push(material);
    if (name.startsWith('gorge-boulder')) material.color.set('#ffdcb4'); else material.color.copy(warm);
    for (let c = 0; c < CHUNKS.length - 1; c++) {
      const list = all.filter(entry => entry.x >= CHUNKS[c] && entry.x < CHUNKS[c + 1]); if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(model.geometry, material, list.length); mesh.name = `${name} (efra ${c})`;
      list.forEach((entry, i) => { dummy.position.set(entry.x, entry.y, entry.z); dummy.rotation.set(entry.tilt, entry.yaw, 0, 'YXZ'); dummy.scale.setScalar(entry.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(entry.tint, entry.tint, entry.tint)); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.frustumCulled = true; mesh.receiveShadow = true; mesh.castShadow = name.startsWith('gorge-boulder');
      frame.add(mesh); triangles += model.triangles * list.length; draws++;
    }
  }

  // ---- the exit of the tunnel: the owner's tunnel model again, its mouth toward the floor, the dark bore lit by the plates' glow like the first ----
  const tunnelModel = models.get('gorge-tunnel'), tunnelMaterial = tunnelModel.material.clone(); disposables.push(tunnelMaterial);
  tunnelMaterial.color.set('#e8c0a2'); darkInside(tunnelMaterial, glow);
  const tunnel = new THREE.Mesh(tunnelModel.geometry, tunnelMaterial); tunnel.name = 'Útgangur ganganna'; tunnel.receiveShadow = true;
  tunnel.position.set(EXIT.mouth - BORE.mouth, -.05, -BORE.across); frame.add(tunnel); triangles += tunnelModel.triangles; draws++;
  const backGeometry = new THREE.PlaneGeometry(3.4, 3.0); backGeometry.rotateY(Math.PI / 2); backGeometry.translate(-2.55, 1.35, BORE.across);
  const back = new THREE.Mesh(backGeometry, new THREE.MeshBasicMaterial({ color: '#070504', fog: false })); back.name = 'Myrkur innst (útgangur)'; tunnel.add(back); disposables.push(backGeometry, back.material);
  frame.updateMatrixWorld(true);
  /** The mouth of the exit on the floor, and the middle of the bore a few metres in. */
  const exit = { mouth: new THREE.Vector3(EXIT.mouth, 0, 0), inside: new THREE.Vector3(EXIT.mouth - 5.2, 0, 0) };

  // ---- the slab: it leans on the ledge, hinged at the riser's top edge; its angle (degrees above the horizontal, toward the floor) is how far it has been pulled down ----
  const [slabPart] = upperModels.slab, slabMaterial = slabPart.material.clone(); slabMaterial.color.set('#dba06c'); slabMaterial.roughness = .95; slabMaterial.metalness = 0; slabMaterial.side = THREE.FrontSide; disposables.push(slabMaterial);
  const SLAB = { length: 4.8, thick: 3.1, width: 1.16, hinge: new THREE.Vector3(LEDGE.x + .05, LEDGE.height - .3, 0), start: 52, steps: [52, 31, 10, -24] };
  const slabGeometry = slabPart.geometry.clone(); slabGeometry.translate(1.8, 0, 0); disposables.push(slabGeometry);
  const slabMesh = new THREE.Mesh(slabGeometry, slabMaterial); slabMesh.name = 'Hellan'; slabMesh.scale.set(SLAB.length / 3.6, SLAB.thick, SLAB.width); slabMesh.castShadow = true; slabMesh.receiveShadow = true;
  const slabPivot = new THREE.Group(); slabPivot.name = 'Hellan (lömin)'; slabPivot.position.copy(SLAB.hinge); slabPivot.add(slabMesh); frame.add(slabPivot); triangles += slabPart.triangles; draws++;
  let slabAngle = SLAB.start;
  const slab = {
    get angle() { return slabAngle; }, steps: SLAB.steps,
    /** Lays the slab at `degrees` above the horizontal (toward the floor); negative is lying down the ledge. */
    set(degrees) { slabAngle = degrees; slabPivot.rotation.set(0, Math.PI, THREE.MathUtils.degToRad(degrees), 'YXZ'); frame.updateMatrixWorld(true); },
    /** A point of the slab's underside at `u` metres from the hinge (frame coordinates; z across). */
    under(u, across = 0, degrees = slabAngle) { const a = THREE.MathUtils.degToRad(degrees); return new THREE.Vector3(SLAB.hinge.x - Math.cos(a) * u, SLAB.hinge.y + Math.sin(a) * u, across); },
    /** A point on the slab's top face at `u` metres from the hinge. */
    top(u, across = 0, degrees = slabAngle) { const a = THREE.MathUtils.degToRad(degrees), p = slab.under(u, across, degrees); const t = .3325 * SLAB.thick; return p.add(new THREE.Vector3(Math.sin(a) * t, Math.cos(a) * t, 0)); },
    /** The line a friend walks up the slab when it lies as a ramp: from the floor to the ledge's top, in frame coordinates. */
    ramp(across = 0, from = SLAB.length - .4, to = .3) { return [from, (from + to) / 2, to].map(u => slab.top(u, across, SLAB.steps.at(-1))); },
    length: SLAB.length, width: SLAB.width * 3.6 * 0.8, hinge: SLAB.hinge.clone(),
  };
  slab.set(SLAB.start);

  // ---- the tree on the rim ----
  const TREE = { at: new THREE.Vector3(23.4, 0, 12.1), lean: -.07, tint: { wood: '#8d6244', green: '#8f9a4c' } };
  TREE.at.y = groundAt(TREE.at.x, TREE.at.z);
  const treeGroup = new THREE.Group(); treeGroup.name = 'Tréð';
  const treeMaterials = [];
  for (const [i, part] of upperModels.tree.entries()) {
    const material = part.material.clone(); material.color.set(i === 0 ? TREE.tint.wood : TREE.tint.green); material.roughness = .92; material.metalness = 0; material.side = THREE.DoubleSide; treeMaterials.push(material); disposables.push(material);
    const mesh = new THREE.Mesh(part.geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = i === 0 ? 'Tré (stofn)' : 'Tré (króna)'; treeGroup.add(mesh); triangles += part.triangles; draws++;
  }
  // the trunk: where the wood stands at the ground and how thick it is a metre up (read off the model, so the rope winds round the real trunk)
  const wood = upperModels.tree[0].geometry.attributes.position, foot = new THREE.Vector3(), count = { low: 0, mid: 0 };
  for (let i = 0; i < wood.count; i++) if (wood.getY(i) < .35) { foot.x += wood.getX(i); foot.z += wood.getZ(i); count.low++; }
  foot.multiplyScalar(1 / Math.max(1, count.low));
  let radius = 0; for (let i = 0; i < wood.count; i++) if (wood.getY(i) > .7 && wood.getY(i) < 1.3) { radius = Math.max(radius, Math.hypot(wood.getX(i) - foot.x, wood.getZ(i) - foot.z)); count.mid++; }
  treeGroup.position.copy(TREE.at).sub(foot.setY(0)); treeGroup.position.y = TREE.at.y - .08; treeGroup.rotation.set(0, 1.1, 0); treeGroup.rotateZ(TREE.lean);
  frame.add(treeGroup); frame.updateMatrixWorld(true);
  const tree = { base: TREE.at.clone(), radius: Math.min(.5, Math.max(.16, radius)), height: 4.8 };
  // the trunk's middle at a height above the ground, tilted with the tree (a point of the frame)
  tree.point = (height = 0) => { const p = new THREE.Vector3(TREE.at.x, height, TREE.at.z).sub(foot.set(TREE.at.x, 0, TREE.at.z)).add(TREE.at); p.y = TREE.at.y + height; p.x += Math.sin(-TREE.lean) * height * 0; return p; };

  // ---- where things are (frame coordinates): the places the group stands and the rope's anchors ----
  const rail = way.map(([x, z, y]) => new THREE.Vector3(x, y, z));
  const anchors = {
    exit,
    // the foot of the rope: a boulder at the start of the path, beside it on the hillside's side
    stake: new THREE.Vector3(10.3, groundAt(10.3, 1.6), 1.6),
    tree: tree.base,
  };

  const api = {
    group: frame, terrain, heightAt, groundAt, world, local, direction, yawOf, onGround, slab, tree, anchors, rail, ledge: LEDGE, climb: CLIMB, rim: RIM, wall: WALL,
    /** The upper gorge is drawn from now on (the first cut into it). */
    show() { frame.visible = true; },
    hide() { frame.visible = false; },
    get visible() { return frame.visible; },
    stats: () => ({ triangles, draws, mesaTriangles: index.length / 3, cliffKinds: [...placements].map(([name, list]) => `${name} x${list.length}`), visible: frame.visible, slabAngle }),
    reset() { slab.set(SLAB.start); frame.visible = false; },
    dispose() { scene.remove(frame); for (const item of disposables) item.dispose?.(); for (const part of [...upperModels.slab, ...upperModels.tree]) part.geometry.dispose(); },
  };
  return api;
}
