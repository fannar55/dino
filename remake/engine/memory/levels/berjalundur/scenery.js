import * as THREE from 'three';
import { createSpeciesLibrary } from '../../../../world/forest/species.js';
import { createLivingForest, installStoryBreeze } from '../../world-living-forest.js';

/** Low, lush edge detail round the glade and its flowers, stones and ferns. */
/** `avoid(x, z, margin)` says where a plant, flower or stone may not stand: on a leaf's ground (world.js knows the leaves). */
export function createGladeScenery(world, { avoid = () => false } = {}) {
  const root = new THREE.Group(); root.name = 'Laufbeð og blóm í rjóðri'; world.scene.add(root);
  const geometries = [], materials = [], collisionObjects = [], navigationObjects = [], breezeMaterials = [], dummy = new THREE.Object3D();
  const living = createLivingForest(world, { avoid: (x, z) => avoid(x, z, 0) });
  function solidBounds(id, positions, transform) {
    const box = new THREE.Box3();
    for (let i = 0; i < positions.length; i += 3) box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    const center = box.getCenter(new THREE.Vector3()).applyMatrix4(transform), half = box.getSize(new THREE.Vector3()).multiplyScalar(.5), e = transform.elements;
    const axes = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]], scale = axes.map(a => Math.hypot(...a));
    axes.forEach((a, i) => a.forEach((v, j) => { a[j] = v / scale[i]; }));
    const part = { id, name: id, kind: 'tree-or-stone', center: center.toArray(), axes, half: half.toArray().map((v, i) => v * scale[i]) };
    collisionObjects.push({ id, parts: [part] });
    const radius = Math.hypot(...part.half.map((v, i) => v * Math.hypot(axes[i][0], axes[i][2])));
    navigationObjects.push({ id, a: center.clone(), b: center.clone(), radius, parts: [part] });
  }
  const geometry = value => { geometries.push(value); return value; };
  const material = value => { const result = new THREE.MeshStandardMaterial({ roughness: .95, ...value }); materials.push(result); return result; };
  const frondGeometry = geometry(new THREE.BufferGeometry());
  const vertices = [], normals = [];
  const outline = [[0, 0, 0], [-.08, .07, .12], [-.115, .1, .25], [-.07, .12, .4], [0, .11, .52], [.07, .12, .4], [.115, .1, .25], [.08, .07, .12]];
  for (let i = 1; i < outline.length - 1; i++) { vertices.push(...outline[0], ...outline[i], ...outline[i + 1]); normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0); }
  frondGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); frondGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const clumps = [];
  const rim = [[-8.3, 1], [-12.3, 8], [-9.8, 14], [-6.6, 14.4], [-3.4, 14.2], [-.4, 13.4], [3.7, 10.7], [5.1, 1.0], [3.8, -.1], [-7.2, -1.5]];
  for (const [x, z] of rim) for (let i = 0; i < 9; i++) if (!avoid(x, z, .6)) clumps.push({ x: x + Math.cos(i * 2.4) * .25, z: z + Math.sin(i * 2.4) * .25, scale: .9 + i % 3 * .2, angle: i * 2.4 });
  const fronds = new THREE.InstancedMesh(frondGeometry, material({ color: '#7c9f42', side: THREE.DoubleSide }), clumps.length); fronds.receiveShadow = true; root.add(fronds);
  clumps.forEach((part, i) => { dummy.position.set(part.x, world.heightAt(part.x, part.z) + .1, part.z); dummy.rotation.set(.06, part.angle, 0); dummy.scale.setScalar(part.scale); dummy.updateMatrix(); fronds.setMatrixAt(i, dummy.matrix); fronds.setColorAt(i, new THREE.Color(i % 3 === 0 ? '#a2b85a' : i % 3 === 1 ? '#77913f' : '#526f36')); });

  const flowerGeometry = geometry(new THREE.BufferGeometry()), flowerVertices = [], flowerColors = [];
  function triangle(a, b, c, tint) { flowerVertices.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) flowerColors.push(tint.r, tint.g, tint.b); }
  for (let plant = 0; plant < 14; plant++) {
    const [cx, cz] = rim[plant % rim.length], x = cx + Math.sin(plant * 3.4) * .35, z = cz + Math.cos(plant * 3.4) * .3, y = world.heightAt(x, z) + .26 + (plant % 3) * .05;
    if (avoid(x, z, .3)) continue;
    const petals = new THREE.Color(plant % 4 ? '#f3e8c2' : '#e6b951'), centre = new THREE.Color('#d7ac45');
    const stem = new THREE.Color('#617b3b'), ground = world.heightAt(x, z) + .07;
    triangle([x - .012, ground, z], [x + .012, ground, z], [x + .01, y, z], stem);
    triangle([x - .012, ground, z], [x + .01, y, z], [x - .01, y, z], stem);
    triangle([x, ground + .08, z], [x - .12, ground + .15, z + .035], [x - .015, ground + .17, z], stem);
    for (let petal = 0; petal < 5; petal++) { const angle = petal * Math.PI * .4, px = x + Math.cos(angle) * .075, pz = z + Math.sin(angle) * .075; for (let side = 0; side < 6; side++) { const a = side * Math.PI / 3, b = (side + 1) * Math.PI / 3; triangle([px, y, pz], [px + Math.cos(b) * .065, y - .016, pz + Math.sin(b) * .065], [px + Math.cos(a) * .065, y - .016, pz + Math.sin(a) * .065], petals); } }
    for (let side = 0; side < 7; side++) { const a = side * Math.PI * 2 / 7, b = (side + 1) * Math.PI * 2 / 7; triangle([x, y + .018, z], [x + Math.cos(b) * .037, y + .012, z + Math.sin(b) * .037], [x + Math.cos(a) * .037, y + .012, z + Math.sin(a) * .037], centre); }
  }
  flowerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(flowerVertices, 3)); flowerGeometry.setAttribute('color', new THREE.Float32BufferAttribute(flowerColors, 3)); flowerGeometry.computeVertexNormals();
  const flowers = new THREE.Mesh(flowerGeometry, material({ vertexColors: true, side: THREE.DoubleSide })); flowers.receiveShadow = true; root.add(flowers);

  const pebbleGeometry = geometry(new THREE.SphereGeometry(1, 9, 6)), mossGeometry = geometry(new THREE.SphereGeometry(1, 8, 4));
  const stonePlaces = [[-12.3, 8], [-6.6, 14.4], [5.1, 1.0], [-12.2, -1.3]].filter(([x, z]) => !avoid(x, z, .6));
  const rocks = new THREE.InstancedMesh(pebbleGeometry, material({ color: '#928d73' }), stonePlaces.length), moss = new THREE.InstancedMesh(mossGeometry, material({ color: '#7e9844' }), stonePlaces.length); rocks.castShadow = true; rocks.receiveShadow = moss.receiveShadow = true; root.add(rocks, moss);
  stonePlaces.forEach(([x, z], i) => { const radius = .24 + (i % 3) * .08; dummy.position.set(x + .24, world.heightAt(x, z) + radius * .28, z - .25); dummy.scale.set(radius * 1.35, radius * .65, radius); dummy.rotation.set(.12, i * 1.3, .08); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); solidBounds(`glade-stone-${i}`, pebbleGeometry.attributes.position.array, dummy.matrix); dummy.position.y += radius * .28; dummy.scale.set(radius * 1.1, radius * .28, radius * .9); dummy.updateMatrix(); moss.setMatrixAt(i, dummy.matrix); });

  // Reuse the forest's authored leaflet forms. Two merged meshes keep the
  // layered fringe inexpensive while giving the clearing a fern silhouette.
  const library = createSpeciesLibrary(251017), zoneOf = z => z > -8 ? 0 : z > -20 ? 1 : 2, botanical = Object.fromEntries(['solid', 'thin'].map(part => [part, [0, 1, 2].map(() => ({ p: [], n: [], c: [], i: [] }))]));
  // The tall ones (tree ferns and cycads) round the three play places; the low ferns, stones and flowers are dressing.js's.
  const plants = [
    ['treeFern', -11.4, 1.8, 1.08, .4, 1], ['treeFern', -12.5, 11.5, 1.02, 1.3, 1],
    ['treeFern', 8.5, 8.2, 1.12, 2.6, 1], ['treeFern', 14, -13.5, 1.18, .2, 1],
    ['treeFern', -3.2, -15.2, 1.2, 1.6, 1], ['treeFern', 14.2, -17, 1.15, .5, 1],
    ['treeFern', -2.5, -29.8, 1.4, 2.4, 1], ['treeFern', 11.2, -29.8, 1.5, 1.3, 1],
    ['cycad', -2.4, -23.4, 1.1, .4, 1], ['cycad', 11.3, -23.4, 1.1, 2.4, 1],
  ];
  const tint = new THREE.Color();
  plants.forEach(([kind, x, z, scale, yaw, lod], variant) => {
    if (avoid(x, z, scale * .55)) return;
    const model = library.get(kind, variant % 3, lod), cos = Math.cos(yaw), sin = Math.sin(yaw), y = world.heightAt(x, z) + .045;
    if (model.solid?.pos.length) solidBounds(`glade-${kind}-${variant}`, model.solid.pos, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(scale, scale, scale)));
    for (const part of ['solid', 'thin']) {
      const source = model[part]; if (!source) continue;
      const batch = botanical[part][zoneOf(z)], offset = batch.p.length / 3;
      for (let i = 0; i < source.pos.length; i += 3) {
        batch.p.push(x + (source.pos[i] * cos + source.pos[i + 2] * sin) * scale, y + source.pos[i + 1] * scale, z + (source.pos[i + 2] * cos - source.pos[i] * sin) * scale);
        batch.n.push(source.nrm[i] * cos + source.nrm[i + 2] * sin, source.nrm[i + 1], source.nrm[i + 2] * cos - source.nrm[i] * sin);
        tint.setRGB(source.col[i], source.col[i + 1], source.col[i + 2]).convertSRGBToLinear(); batch.c.push(tint.r, tint.g, tint.b);
      }
      for (const index of source.idx) batch.i.push(index + offset);
    }
  });
  for (const [part, zones] of Object.entries(botanical)) for (const [zone, batch] of zones.entries()) {
    if (!batch.i.length) continue;
    const g = geometry(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(batch.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(batch.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(batch.c, 3)); g.setIndex(batch.i); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material({ vertexColors: true, side: part === 'thin' ? THREE.DoubleSide : THREE.FrontSide })); mesh.name = `Rjóðurburknar · ${part}`; mesh.userData.zone = zone; mesh.receiveShadow = true; mesh.castShadow = part === 'solid'; root.add(mesh);
  }

  // All these matte, static plants share two colour batches: opaque pieces
  // that cast a small shadow, and soft two-sided foliage. Their painted vertex
  // colours survive the merge, including the per-instance moss/leaf tints.
  const sceneryBatches = new Map(), worldMatrix = new THREE.Matrix4(), instanceMatrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), position = new THREE.Vector3(), normal = new THREE.Vector3(), instanceTint = new THREE.Color(), vertexTint = new THREE.Color();
  root.updateMatrixWorld(true);
  for (const source of [...root.children]) {
    if (!source.isMesh) continue;
    const key = `${source.castShadow ? 'solid' : 'foliage'}:${source.userData.zone ?? 0}`;
    if (!sceneryBatches.has(key)) sceneryBatches.set(key, { p: [], n: [], c: [], i: [] });
    const batch = sceneryBatches.get(key), g = source.geometry, count = source.isInstancedMesh ? source.count : 1;
    for (let instance = 0; instance < count; instance++) {
      if (source.isInstancedMesh) { source.getMatrixAt(instance, instanceMatrix); worldMatrix.multiplyMatrices(source.matrixWorld, instanceMatrix); } else worldMatrix.copy(source.matrixWorld);
      normalMatrix.getNormalMatrix(worldMatrix); instanceTint.set(0xffffff); if (source.instanceColor) source.getColorAt(instance, instanceTint);
      const offset = batch.p.length / 3;
      for (let i = 0; i < g.attributes.position.count; i++) {
        position.fromBufferAttribute(g.attributes.position, i).applyMatrix4(worldMatrix); normal.fromBufferAttribute(g.attributes.normal, i).applyNormalMatrix(normalMatrix); batch.p.push(position.x, position.y, position.z); batch.n.push(normal.x, normal.y, normal.z);
        if (g.attributes.color) vertexTint.fromBufferAttribute(g.attributes.color, i); else vertexTint.set(0xffffff);
        vertexTint.multiply(source.material.color).multiply(instanceTint); batch.c.push(vertexTint.r, vertexTint.g, vertexTint.b);
      }
      if (g.index) for (const index of g.index.array) batch.i.push(index + offset); else for (let i = 0; i < g.attributes.position.count; i++) batch.i.push(i + offset);
    }
    source.removeFromParent();
  }
  for (const [key, batch] of sceneryBatches) {
    const g = geometry(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(batch.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(batch.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(batch.c, 3)); g.setIndex(batch.i); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material({ vertexColors: true, side: key.startsWith('solid') ? THREE.FrontSide : THREE.DoubleSide })); mesh.name = `Rjóðurskraut · ${key}`; mesh.castShadow = key.startsWith('solid'); mesh.receiveShadow = true; root.add(mesh);
    if(key.startsWith('foliage'))breezeMaterials.push(installStoryBreeze(mesh.material,g,world.heightAt));
  }
  const pollenData = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot((x + .5) / 16 - 1, (y + .5) / 16 - 1), i = (y * 32 + x) * 4; pollenData[i] = pollenData[i + 1] = pollenData[i + 2] = 255; pollenData[i + 3] = Math.round(Math.max(0, 1 - d) ** 2 * 255); }
  const pollenTexture = new THREE.DataTexture(pollenData, 32, 32, THREE.RGBAFormat); pollenTexture.magFilter = THREE.LinearFilter; pollenTexture.needsUpdate = true;
  const pollenPositions = new Float32Array(36 * 3), pollenGeometry = geometry(new THREE.BufferGeometry()); pollenGeometry.setAttribute('position', new THREE.BufferAttribute(pollenPositions, 3));
  const pollenMaterial = new THREE.PointsMaterial({ map: pollenTexture, color: '#ffe5ad', size: .13, opacity: .54, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); materials.push(pollenMaterial);
  const pollen = new THREE.Points(pollenGeometry, pollenMaterial); pollen.frustumCulled = false; root.add(pollen);
  function update(time, reduced) {
    living.update(time,reduced);breezeMaterials.forEach(breeze=>breeze.update(time,reduced));
    pollen.visible = !reduced;
    for (let i = 0; i < 36; i++) { const zone = i % 3, cx = zone ? 4.5 : -2, cz = zone === 0 ? 2 : zone === 1 ? -13 : -26, x = cx + Math.sin(i * 17.2) * 4.4, z = cz + Math.cos(i * 5.1) * 2.5; pollenPositions[i * 3] = x + Math.sin(time * .19 + i) * .25; pollenPositions[i * 3 + 1] = world.heightAt(x, z) + .4 + ((time * .09 + i * .31) % 1) * 1.5; pollenPositions[i * 3 + 2] = z + Math.cos(time * .17 + i) * .18; }
    pollenGeometry.attributes.position.needsUpdate = true;
  }
  update(0, false);
  return { root, update, collisionObjects, navigationObjects, getDebug:living.getDebug, dispose() { living.dispose();root.removeFromParent(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); pollenTexture.dispose(); } };
}
