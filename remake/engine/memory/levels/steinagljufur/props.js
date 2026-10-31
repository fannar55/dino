import * as THREE from 'three';
import { GLTFLoader } from '../../../../../dist/vendor/GLTFLoader.js';
import { closure, outside } from './ground.js';

/**
 * The gorge's static scenery, all of it the owner's approved models (assets/memory/bord2/, each with a -source.json): seven pieces of sandstone
 * cliff (YadroGames, CC BY) stacked into the walls, two boulders (Quaternius, CC0) at their foot and on the floor, and the tunnel mouth the
 * owner made in Tripo3D. Nothing here is drawn or modelled by hand: the world only places, turns and scales them.
 *
 * Each model is read once and baked (the node's scale and the quantized positions) into plain float geometry; every kind of piece is one
 * InstancedMesh, so the whole static gorge is one draw call for each of its kinds (the budget is the ≤ 40,000 triangles the plan sets
 * for the gorge in the search view: `stats().triangles` says what stands).
 */
const FILES = ['gorge-cliff-0', 'gorge-cliff-1', 'gorge-cliff-2', 'gorge-cliff-3', 'gorge-cliff-4', 'gorge-cliff-5', 'gorge-cliff-6', 'gorge-boulder-1', 'gorge-boulder-2', 'gorge-tunnel'];
const url = name => new URL(`../../../../assets/memory/bord2/${name}.glb`, import.meta.url).href;

// A small seeded generator (mulberry32): the gorge is the same every time.
const seeded = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** The first mesh of a model as plain float geometry in the model's own frame (its node's scale applied), with the material the file has. */
function bake(mesh) {
  mesh.updateWorldMatrix(true, false);
  const source = mesh.geometry, matrix = mesh.matrixWorld, normal = new THREE.Matrix3().getNormalMatrix(matrix), count = source.attributes.position.count;
  const position = new Float32Array(count * 3), normals = new Float32Array(count * 3), uv = new Float32Array(count * 2), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(source.attributes.position, i).applyMatrix4(matrix).toArray(position, i * 3);
    v.fromBufferAttribute(source.attributes.normal, i).applyMatrix3(normal).normalize().toArray(normals, i * 3);
    uv[i * 2] = source.attributes.uv.getX(i); uv[i * 2 + 1] = source.attributes.uv.getY(i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(source.index.array), 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, material: mesh.material, triangles: source.index.count / 3 };
}

/** Reads the gorge's models: a Map of name -> { geometry, material, triangles }. */
export async function loadGorgeModels() {
  const loader = new GLTFLoader();
  return new Map(await Promise.all(FILES.map(async name => {
    const gltf = await loader.loadAsync(url(name));
    gltf.scene.updateMatrixWorld(true);
    let mesh = null; gltf.scene.traverse(object => { if (object.isMesh && !mesh) mesh = object; });
    if (!mesh) throw new Error(`${name} has no mesh`);
    return [name, bake(mesh)];
  })));
}

/**
 * Stands the scenery. `frame` is the glade's (ground.js frameOf), `heightAt(x, z)` the ground, `avoid(u, v, radius)` says where nothing may
 * stand (the leaves, the rests, Mosi and the tunnel's mouth). Returns { group, tunnel, solids, stats(), dispose() }.
 */
export function buildGorge({ scene, frame, heightAt, models, avoid = () => false, tunnel: place }) {
  const group = new THREE.Group(); group.name = 'Steinagljúfrið'; scene.add(group);
  const random = seeded(20261031), range = (a, b) => a + (b - a) * random(), pick = list => list[Math.floor(random() * list.length) % list.length];
  const dummy = new THREE.Object3D(), disposables = [], solids = [];
  const placements = new Map(); // model name -> [{ x, y, z, yaw, scale, tilt, tint }]
  const add = (name, entry) => { if (!placements.has(name)) placements.set(name, []); placements.get(name).push(entry); };

  // ---- the walls: three rows of cliff pieces round the back and the left of the floor, each further out and higher ----
  // A row follows the floor's edge at `offset` metres outside it; walking the rows round the grid, a piece stands about `spacing` metres after the
  // last one wherever the wall is closed (`closure`), smaller where it fades out over the open side.
  const ROWS = [
    { offset: 1.8, spacing: 4.6, scale: [2.5, 3.3], sink: .55, kinds: [0, 3, 4, 5, 6, 1, 2] },
    { offset: 6.2, spacing: 5.6, scale: [3.4, 4.2], sink: .7, kinds: [1, 2, 5, 6, 0, 3] },
    { offset: 11.4, spacing: 6.8, scale: [4.2, 5.2], sink: .9, kinds: [2, 1, 6, 5, 0] },
  ];
  const edgePoint = (angle, offset) => {
    // Along the ray from the middle of the floor at `angle`, the point `offset` metres outside the floor's edge.
    let near = 0, far = 80;
    for (let i = 0; i < 28; i++) { const mid = (near + far) / 2; if (outside(Math.cos(angle) * mid, Math.sin(angle) * mid) > offset) far = mid; else near = mid; }
    return [Math.cos(angle) * near, Math.sin(angle) * near];
  };
  for (const [rowIndex, row] of ROWS.entries()) {
    let angle = THREE.MathUtils.degToRad(-8), last = null;
    for (let step = 0; step < 400 && angle < THREE.MathUtils.degToRad(352); step++) {
      const [u, v] = edgePoint(angle, row.offset + range(-.7, .7)), wall = closure(u, v);
      if (!last || Math.hypot(u - last[0], v - last[1]) >= row.spacing * range(.8, 1.15)) {
        if (wall > .42) {
          const kind = pick(row.kinds), scale = range(...row.scale) * (.55 + .45 * wall), [x, z] = frame.toWorld(u, v);
          add(`gorge-cliff-${kind}`, { x, z, y: heightAt(x, z) - row.sink * scale, yaw: range(0, Math.PI * 2), scale, tilt: range(-.05, .05), tint: .86 + .2 * random() });
          last = [u, v];
        }
      }
      angle += THREE.MathUtils.degToRad(1.2);
    }
    void rowIndex;
  }

  // ---- the boulders: at the foot of the walls, where they hide the seam, and a few on the floor's rim and the open side ----
  const BOULDERS = [
    // [u, v, boulder, scale, yaw]
    [-7.8, 10.2, 1, .62, .4], [-1.6, 11.6, 2, .46, 2.1], [5.4, 11.4, 1, .55, 1.2], [10.6, 8.4, 2, .4, 3.4], [-13.4, 1.8, 1, .6, 2.6], [-12.6, -6.8, 2, .5, .9], [-9.4, -10.8, 1, .5, 5.2],
    [13.6, -9.6, 2, .45, 1.7], [14.8, -2.2, 1, .5, 4.1], [9.6, -13.2, 1, .6, .3], [3.2, -13.4, 2, .38, 2.9], [-3.2, -14.2, 1, .52, 3.7], [15.6, 5.6, 1, .66, 5.9],
  ];
  for (const [u, v, kind, scale, yaw] of BOULDERS) {
    if (avoid(u, v, 2.4)) continue;
    const [x, z] = frame.toWorld(u, v), model = models.get(`gorge-boulder-${kind}`).geometry.boundingBox, radius = Math.max(model.max.x - model.min.x, model.max.z - model.min.z) / 2 * scale * .8;
    add(`gorge-boulder-${kind}`, { x, z, y: heightAt(x, z) - .18 * scale, yaw, scale, tilt: 0, tint: .9 + .15 * random() });
    solids.push({ id: `boulder-${solids.length}`, a: new THREE.Vector3(x, 0, z), b: new THREE.Vector3(x, 0, z), radius });
  }

  // ---- instanced meshes, one for each kind ----
  let triangles = 0, draws = 0;
  const warm = new THREE.Color('#ffe6cc');
  for (const [name, list] of placements) {
    const model = models.get(name), material = model.material.clone();
    material.side = THREE.FrontSide; disposables.push(material);
    if (name.startsWith('gorge-boulder')) material.color.set('#ffdcb4'); // the palette's brown, lightened to sit with the sandstone
    else material.color.copy(warm);
    const mesh = new THREE.InstancedMesh(model.geometry, material, list.length); mesh.name = name;
    list.forEach((entry, i) => {
      dummy.position.set(entry.x, entry.y, entry.z); dummy.rotation.set(entry.tilt, entry.yaw, 0, 'YXZ'); dummy.scale.setScalar(entry.scale); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(entry.tint, entry.tint, entry.tint));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = name.startsWith('gorge-boulder');
    group.add(mesh); triangles += model.triangles * list.length; draws++;
  }

  // ---- the tunnel mouth: stands against the wall, its opening toward the glade ----
  const tunnelModel = models.get('gorge-tunnel'), tunnelMaterial = tunnelModel.material.clone(); disposables.push(tunnelMaterial);
  tunnelMaterial.color.set('#e6ae8a'); // a little deeper than the owner's model, to sit with the cliffs
  const tunnel = new THREE.Mesh(tunnelModel.geometry, tunnelMaterial); tunnel.name = 'Gangaopið'; tunnel.receiveShadow = true;
  const [tx, tz] = frame.toWorld(...place.at);
  tunnel.position.set(tx, heightAt(tx, tz) - .05, tz); tunnel.rotation.y = frame.yawToward(...place.facing); tunnel.scale.setScalar(place.scale ?? 1);
  group.add(tunnel); triangles += tunnelModel.triangles; draws++;
  tunnel.updateMatrixWorld(true);
  const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(tunnel.quaternion), side = new THREE.Vector3(0, 0, 1).applyQuaternion(tunnel.quaternion);
  const half = [3.9 * (place.scale ?? 1), 4.5 * (place.scale ?? 1)];
  // The mound as the friends' walks and play see it: a thick wall across its width (the opening is walked into only by the tunnel's own scenes).
  solids.push({ id: 'tunnel', a: tunnel.position.clone().addScaledVector(side, -half[1] * .7).addScaledVector(facing, -half[0] * .35), b: tunnel.position.clone().addScaledVector(side, half[1] * .7).addScaledVector(facing, -half[0] * .35), radius: half[0] * .75 });

  return {
    group, tunnel, solids,
    /** Where the opening is: its middle on the ground, and the way it faces. */
    mouth: { point: tunnel.position.clone().addScaledVector(facing, half[0]), facing },
    stats: () => ({ triangles, draws, kinds: [...placements].map(([name, list]) => `${name} x${list.length}`) }),
    dispose() { scene.remove(group); for (const item of disposables) item.dispose(); for (const model of models.values()) model.geometry.dispose(); },
  };
}
