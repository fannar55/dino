import * as THREE from 'three';
import { createSpeciesLibrary } from '../../world/forest/species.js';
import { RIVER, MARSH, riverDistance } from './bridge-props.js';
import { createLivingForest, installStoryBreeze } from './world-living-forest.js';

const colour = hex => new THREE.Color(hex);
const clamp = THREE.MathUtils.clamp;
const LEAF_LENGTH = 2.6, LEAF_WIDTH = 1.3;
const leafHeight = (t, s) => Math.pow(Math.sin(t * Math.PI), .85) * (.81 - .80 * Math.pow(Math.abs(s), .9) - .07 * s) - .22 + Math.sin(t * Math.PI * 4) * .025 * s * s;
const leafWidth = t => LEAF_WIDTH * Math.pow(Math.sin(Math.PI * (t * .94 + .025)), .67);
const leafX = (t, s) => leafWidth(t) * (s + .09 * Math.sin(t * Math.PI) * (1 - Math.abs(s)));

/** One thick, gently folded broad leaf. Every hiding place shares this geometry. */
export function createLeafResources() {
  const geometry = new THREE.BufferGeometry(), positions = [], colours = [], indices = [], uvs = [];
  const rows = 24, columns = 12;
  const base = colour('#6e9848'), light = colour('#99b85b'), edge = colour('#54743a');
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, z = t * LEAF_LENGTH;
    for (let j = 0; j <= columns; j++) {
      const s = j / columns * 2 - 1;
      const x = leafX(t, s);
      const y = leafHeight(t, s);
      positions.push(x, y, z);
      uvs.push((s + 1) / 2, t);
      const c = base.clone().lerp(light, (1 - Math.abs(s)) * .36 + Math.sin(t * Math.PI) * .1).lerp(edge, Math.pow(Math.abs(s), 7) * .28);
      colours.push(c.r, c.g, c.b);
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  // Thin underside and stitched edge give the leaf a softly rolled physical rim.
  const topCount = positions.length / 3, topIndices = [...indices];
  for (let i = 0; i < topCount; i++) {
    positions.push(positions[i * 3], positions[i * 3 + 1] - .035, positions[i * 3 + 2]);
    uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
    colours.push(colours[i * 3] * .85, colours[i * 3 + 1] * .85, colours[i * 3 + 2] * .85);
  }
  for (let i = 0; i < topIndices.length; i += 3) indices.push(topIndices[i] + topCount, topIndices[i + 2] + topCount, topIndices[i + 1] + topCount);
  const perimeter = [];
  for (let j = 0; j <= columns; j++) perimeter.push(j);
  for (let i = 1; i <= rows; i++) perimeter.push(i * (columns + 1) + columns);
  for (let j = columns - 1; j >= 0; j--) perimeter.push(rows * (columns + 1) + j);
  for (let i = rows - 1; i > 0; i--) perimeter.push(i * (columns + 1));
  for (let i = 0; i < perimeter.length; i++) { const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length]; indices.push(a, b, a + topCount, b, b + topCount, a + topCount); }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Actual longitudinal mesh slices retain the narrow tips. A single OBB
  // would count the empty corners around this domed leaf as solid scenery.
  const collisionSlices = [];
  for (let row = 0; row < rows; row += 2) {
    const box = new THREE.Box3();
    for (let r = row; r <= row + 2; r++) for (let column = 0; column <= columns; column++) for (const underside of [0, topCount]) {
      const i = (r * (columns + 1) + column + underside) * 3;
      box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }
    collisionSlices.push(box);
  }
  const pixels = new Uint8Array(512 * 512 * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const u = x / 512, v = y / 512, side = Math.abs(u - .5) * 2;
    const brush = Math.sin(u * 19 + Math.sin(v * 8) * 1.4) * 5 + Math.sin(v * 17 + u * 4) * 3;
    const midrib = Math.exp(-((u - .5) ** 2) / .003) * 11, grain = Math.sin(x * 17.71 + y * 5.13) * .6;
    const veinWave = Math.abs(Math.sin((v - side * .115) / .105 * Math.PI));
    const paintedVein = (1 - THREE.MathUtils.smoothstep(.04, .20, veinWave)) * side * 8;
    const edgeShade = side ** 3 * 12, i = (y * 512 + x) * 4;
    // A Uint8Array wraps past 255 instead of stopping there: the green of the midrib once did, and showed as a magenta mark.
    pixels[i] = clamp(230 + brush + midrib + paintedVein + grain - edgeShade, 0, 255); pixels[i + 1] = clamp(241 + brush + midrib + paintedVein + grain - edgeShade * .7, 0, 255); pixels[i + 2] = clamp(210 + brush + midrib + paintedVein - edgeShade, 0, 255); pixels[i + 3] = 255;
  }
  const leafTexture = new THREE.DataTexture(pixels, 512, 512, THREE.RGBAFormat); leafTexture.colorSpace = THREE.SRGBColorSpace; leafTexture.magFilter = THREE.LinearFilter; leafTexture.minFilter = THREE.LinearMipmapLinearFilter; leafTexture.generateMipmaps = true; leafTexture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: leafTexture, roughness: .86, metalness: 0 });
  const veinMaterial = new THREE.MeshStandardMaterial({ color: '#8ba35a', roughness: .92 });
  const veinParts = [];
  const centre = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    centre.push(new THREE.Vector3(leafX(t, 0), leafHeight(t, 0) + .027, t * LEAF_LENGTH));
  }
  veinParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(centre), 28, .024, 6, false));
  for (let k = 1; k <= 6; k++) for (const sign of [-1, 1]) {
    const t = .1 + k * .105, points = [];
    for (let j = 0; j <= 10; j++) {
      const s = j / 10 * .91, at = Math.min(.98, t + .115 * s);
      const y = leafHeight(at, sign * s) + .023;
      points.push(new THREE.Vector3(leafX(at, sign * s), y, at * LEAF_LENGTH));
    }
    veinParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, .012, 4, false));
  }
  const stemGeometry = new THREE.CylinderGeometry(.028, .04, .5, 7); stemGeometry.rotateX(Math.PI / 2); stemGeometry.translate(0, 0, -.15);
  const veinGeometry = mergeGeometry([...veinParts, stemGeometry]);
  geometry.computeBoundingBox();
  return { geometry, material, veinGeometry, veinMaterial, collisionSlices, lowest: geometry.boundingBox.min.y,
    dispose() { for (const item of [geometry, material, veinGeometry, veinMaterial, leafTexture]) item.dispose(); },
  };
}

/** The closed leaf's place in its hiding place: its stem is 1.3 m behind the middle, 0.32 m up. */
export const LEAF_REST = Object.freeze({ y: .32, z: -1.3 });
// Where an opened leaf ends up: swung round and flattened to a low dome lying on the ground behind the hiding place.
const LYING = Object.freeze({ height: .2, width: .96, back: 1.35, drift: .45, lift: .55, tilt: .5, raise: .045 });
// Every leaf is drawn this size of the shared geometry: eight of them have to fit the glade.
export const LEAF_SCALE = .86;

/**
 * One pose for the shared leaf, from four numbers. `open` 0 covers the hiding place and 1 lies flat on the ground behind
 * it, a little to the right as the camera sees it (so the friend does not hide it); the leaf lifts, tips and turns on the way. `bounce` squashes (below 0) or stretches (above 0) it, a spring's offset
 * round 0; `vanish` 1 shrinks it away where it lies; `turn` is how far it turns.
 * With all four 0 this is the closed leaf exactly.
 */
export function poseLeaf(leaf, resources, { open = 0, bounce = 0, vanish = 0, turn = 0 } = {}) {
  const half = LEAF_LENGTH / 2, wave = Math.sin(Math.PI * open), squash = Math.max(.25, 1 + bounce), grow = 1 - vanish;
  const sy = LEAF_SCALE * THREE.MathUtils.lerp(1, LYING.height, open) * squash * grow, sxz = LEAF_SCALE * THREE.MathUtils.lerp(1, LYING.width, open) / Math.sqrt(squash) * grow;
  const yaw = turn * open, middleX = LYING.drift * open, middleZ = -LYING.back * open;
  const edge = LEAF_REST.y + resources.lowest + LYING.raise * open;
  leaf.rotation.set(-LYING.tilt * wave, yaw, 0, 'YXZ');
  leaf.scale.set(sxz, sy, sxz);
  leaf.position.set(middleX - half * sxz * Math.sin(yaw), edge - resources.lowest * sy + LYING.lift * wave, middleZ - half * sxz * Math.cos(yaw));
}

export function makeLeaf(resources) {
  const group = new THREE.Group(); group.name = 'Lauf · felið';
  const skin = new THREE.Mesh(resources.geometry, resources.material); skin.castShadow = true; skin.receiveShadow = true;
  const veins = new THREE.Mesh(resources.veinGeometry, resources.veinMaterial); veins.receiveShadow = true;
  group.add(skin, veins);
  return group;
}

function mergeGeometry(parts) {
  const positions = [], normals = [];
  for (const part of parts) {
    const geometry = part.index ? part.toNonIndexed() : part;
    positions.push(...geometry.attributes.position.array); normals.push(...geometry.attributes.normal.array);
    geometry.dispose(); if (geometry !== part) part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); merged.computeBoundingSphere();
  return merged;
}

export function createNestResources() {
  const geometries = [];
  // Interlaced, imperfect twigs: a low soft rim leaves the two faces unobstructed.
  for (let layer = 0; layer < 5; layer++) for (let arc = 0; arc < 8; arc++) {
    const points = [], start = arc / 8 * Math.PI * 2 + layer * .21;
    for (let i = 0; i <= 12; i++) {
      const a = start + i / 12 * .96;
      const r = .94 + layer * .04 + Math.sin(a * 7 + layer) * .025;
      points.push(new THREE.Vector3(Math.cos(a) * r * 1.18, .09 + layer * .052 + Math.sin(a * 5 + layer) * .02, Math.sin(a) * r * .69));
    }
    geometries.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, .05 + layer * .002, 5, false));
  }
  // Loose straw makes the floor read as a bed with a shallow recess.
  for (let i = 0; i < 30; i++) {
    const a = i * 2.39996, r = .15 + .65 * Math.sqrt((i + .5) / 30), x = Math.cos(a) * r, z = Math.sin(a) * r * .58;
    const points = [new THREE.Vector3(x - .23, .085, z - .07), new THREE.Vector3(x, .1, z), new THREE.Vector3(x + .23, .08, z + .06)];
    geometries.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 5, .012, 3, false));
  }
  const geometry = mergeGeometry(geometries);
  const material = new THREE.MeshStandardMaterial({ color: '#9b7445', roughness: .97 });
  const liningGeometry = new THREE.LatheGeometry([[0, .055], [.35, .055], [.7, .07], [.88, .14], [1, .29], [1.1, .3], [1.13, .19], [1.04, .035], [0, .02]].map(([x, y]) => new THREE.Vector2(x, y)), 44);
  liningGeometry.scale(1.18, 1, .69);
  const liningMaterial = new THREE.MeshStandardMaterial({ color: '#a48c56', roughness: 1, side: THREE.DoubleSide });
  return { geometry, material, liningGeometry, liningMaterial,
    dispose() { for (const x of [geometry, material, liningGeometry, liningMaterial]) x.dispose(); },
  };
}

export function makeNest(resources) {
  const root = new THREE.Group(); root.name = 'Hreiður';
  const weave = new THREE.Mesh(resources.geometry, resources.material); weave.castShadow = weave.receiveShadow = true;
  const lining = new THREE.Mesh(resources.liningGeometry, resources.liningMaterial); lining.receiveShadow = true;
  root.add(lining, weave); return root;
}

/** Small local grounding shadows also work when the sun shadow is reduced. */
export function createContactResources() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot((x + .5) / n * 2 - 1, (y + .5) / n * 2 - 1);
    const i = (y * n + x) * 4;
    data[i] = 61; data[i + 1] = 49; data[i + 2] = 30; data[i + 3] = Math.round(Math.pow(Math.max(0, 1 - d), 1.9) * 92);
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
  return { geometry, material, texture, dispose() { geometry.dispose(); material.dispose(); texture.dispose(); } };
}

export function makeContact(resources, width, depth) {
  const mesh = new THREE.Mesh(resources.geometry, resources.material); mesh.scale.set(width, 1, depth); mesh.renderOrder = 8;
  return mesh;
}

/** A warm oval of fine soil, feathered into the established forest ground. */
export function createClearingFloor(world, { width = 17, depth = 13, centerZ = 0, glade = false } = {}) {
  const size = 512, data = new Uint8Array(size * size * 4);
  const path = [[-8, 8], [-6, 4], [-3.4, .4], [-1, -3]], farPath = [[4, -9], [4.5, -12], [4.5, -17.25]], grovePath = [[4.5, -21.75], [4.5, -24], [4.5, -28]];
  function pathDistance(x, z, points) {
    let result = Infinity;
    for (let i = 1; i < points.length; i++) { const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); result = Math.min(result, Math.hypot(x - ax - t * dx, z - az - t * dz)); }
    return result;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const wx = u * width / 2, wz = centerZ - v * depth / 2;
    const r = Math.hypot(u, v), variation = Math.sin(x * .045 + Math.sin(y * .03) * 2) * 4 + Math.sin(y * .11 + x * .13) * 2 + Math.sin(x * 32.17 + y * 27.31) * 1.8;
    const i = (y * size + x) * 4;
    let alpha = clamp((1 - r) / .18, 0, 1), warm = 0;
    if (glade) {
      const clearing = Math.hypot((wx + 4.2) / 9.4, (wz - 6.8) / 7.8), far = Math.hypot((wx - 4.5) / 6, (wz + 13.5) / 3.5), grove = Math.hypot((wx - 4.5) / 5.6, (wz + 26) / 3.7);
      const trail = Math.min(pathDistance(wx, wz, path), pathDistance(wx, wz, farPath), pathDistance(wx, wz, grovePath));
      alpha = Math.max(clamp((1.13 - clearing) / .2, 0, 1), clamp((1.12 - far) / .22, 0, 1), clamp((1.12 - grove) / .22, 0, 1), clamp((1.7 - trail) / .65, 0, 1));
      warm = clamp((1.15 - trail) / 1.15, 0, 1) * 11;
      const riverDry = THREE.MathUtils.smoothstep(riverDistance(wx, wz).distance, RIVER.halfWidth + .08, RIVER.halfWidth + .65);
      const marshRadius = Math.hypot((wx - MARSH.center[0]) / MARSH.halfWidth, (wz - MARSH.center[1]) / MARSH.halfDepth);
      // Let the native grassy bank cover the whole curved marsh shoulder.
      // The painted soil resumes only on flat dry land, without a paper lip.
      alpha *= riverDry * THREE.MathUtils.smoothstep(marshRadius, 1.65, 2.0);
    }
    data[i] = 194 + variation + warm; data[i + 1] = 170 + variation + warm; data[i + 2] = 119 + variation + warm * 1.2;
    data[i + 3] = Math.round(alpha * 252);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(width, depth, 72, 112); geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, centerZ);
  // Check full texture bounds before dropping a triangle, preserving narrow
  // trails while avoiding the broad transparent rectangle around the glades.
  const uv = geometry.attributes.uv, sourceIndex = geometry.index.array, retained = [];
  for (let at = 0; at < sourceIndex.length; at += 3) {
    const ids = [sourceIndex[at], sourceIndex[at + 1], sourceIndex[at + 2]];
    const x0 = clamp(Math.floor(Math.min(...ids.map(i => uv.getX(i))) * size) - 1, 0, size - 1), x1 = clamp(Math.ceil(Math.max(...ids.map(i => uv.getX(i))) * size) + 1, 0, size - 1);
    const y0 = clamp(Math.floor(Math.min(...ids.map(i => uv.getY(i))) * size) - 1, 0, size - 1), y1 = clamp(Math.ceil(Math.max(...ids.map(i => uv.getY(i))) * size) + 1, 0, size - 1);
    let visible = false;
    for (let y = y0; y <= y1 && !visible; y++) for (let x = x0; x <= x1; x++) if (data[(y * size + x) * 4 + 3] > 0) { visible = true; break; }
    if (visible) retained.push(...ids);
  }
  geometry.setIndex(retained);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, world.heightAt(positions.getX(i), positions.getZ(i)) + .075);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, transparent: true, depthWrite: false });
  // Fine soil and the gentle movement of canopy light remain readable between
  // the planted edges without adding solid clutter to the walking lanes.
  material.onBeforeCompile = shader => {
    shader.uniforms.uSoilTime = world.wind?.uniforms.uWindTime ?? { value: 0 };
    shader.vertexShader=`varying vec2 vSoilPoint;\n${shader.vertexShader}`.replace('#include <begin_vertex>','#include <begin_vertex>\nvSoilPoint=position.xz;');
    shader.fragmentShader=`uniform float uSoilTime;varying vec2 vSoilPoint;\n${shader.fragmentShader}`.replace('#include <color_fragment>',`#include <color_fragment>
      float grain=fract(sin(dot(floor(vSoilPoint*90.0),vec2(12.9898,78.233)))*43758.5453);
      float mottling=sin(vSoilPoint.x*2.4+sin(vSoilPoint.y*1.6))*sin(vSoilPoint.y*3.1);
      vec2 lightPoint=vSoilPoint+vec2(sin(uSoilTime*.23)*.16,cos(uSoilTime*.17)*.13);
      float dapple=smoothstep(.38,.85,sin(lightPoint.x*1.4+sin(lightPoint.y*.9))*sin(lightPoint.y*1.7));
      diffuseColor.rgb*=.97+grain*.045+mottling*.024+dapple*.055;`);
  };
  material.customProgramCacheKey=()=> 'storybook-soil-v2';
  const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; mesh.renderOrder = 8; world.scene.add(mesh);
  return { mesh, dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); } };
}

function roundedFern(variant) {
  const thin = { pos: [], nrm: [], col: [], idx: [] };
  const vertex = (x, y, z, tint) => { const index = thin.pos.length / 3; thin.pos.push(x, y, z); thin.nrm.push(0, 1, 0); thin.col.push(...tint); return index; };
  for (let frond = 0; frond < 6; frond++) {
    const angle = frond * Math.PI / 3 + variant * .13, dx = Math.cos(angle), dz = Math.sin(angle), length = .55 + (frond % 3) * .05;
    const spine = t => [dx * length * t, .04 + Math.sin(t * Math.PI * .85) * .34, dz * length * t];
    for (let segment = 0; segment < 4; segment++) {
      const a = spine(segment / 4), b = spine((segment + 1) / 4), tint = [.45, .57, .25];
      const p = vertex(a[0] - dz * .012, a[1], a[2] + dx * .012, tint), q = vertex(a[0] + dz * .012, a[1], a[2] - dx * .012, tint), r = vertex(b[0] - dz * .008, b[1], b[2] + dx * .008, tint), s = vertex(b[0] + dz * .008, b[1], b[2] - dx * .008, tint);
      thin.idx.push(p, r, q, q, r, s);
    }
    for (let station = 0; station < 4; station++) for (const side of [-1, 1]) {
      const t = .28 + station * .2, p = spine(t), yaw = angle + side * .95, along = [.15 * Math.cos(yaw), .15 * Math.sin(yaw)], across = [-.075 * Math.sin(yaw), .075 * Math.cos(yaw)];
      const x = p[0] + along[0] * .85, z = p[2] + along[1] * .85, y = p[1] + .018, tint = [.38 + station * .018, .56 + station * .015, .24];
      const centre = vertex(x, y + .025, z, tint.map(c => c * 1.12)), ring = [];
      for (let edge = 0; edge < 8; edge++) { const a = edge * Math.PI / 4; ring.push(vertex(x + along[0] * Math.cos(a) + across[0] * Math.sin(a), y - .012 + Math.cos(a) * .015, z + along[1] * Math.cos(a) + across[1] * Math.sin(a), tint)); }
      for (let edge = 0; edge < 8; edge++) thin.idx.push(centre, ring[(edge + 1) % 8], ring[edge]);
    }
  }
  return { thin, solid: null };
}

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
  const library = createSpeciesLibrary(251017), botanical = { solid: { p: [], n: [], c: [], i: [] }, thin: { p: [], n: [], c: [], i: [] } };
  const plants = [
    ['treeFern', -11.4, 1.8, 1.08, .4, 1], ['treeFern', -12.5, 11.5, 1.02, 1.3, 1],
    ['treeFern', 8.5, 8.2, 1.12, 2.6, 1], ['treeFern', 14, -13.5, 1.18, .2, 1],
    ['fern', -7.5, -1.3, 1.65, 1.2, 0], ['fern', -8.8, 3.2, 1.35, 2.1, 0],
    ['fern', -11.4, 12.2, 1.65, .2, 0], ['fern', -5.2, 14.6, 1.35, 2.9, 0],
    ['fern', -.3, 14.3, 1.65, 1.3, 0], ['fern', 3.3, 11.3, 1.25, 2.1, 0],
    ['fern', 5.1, 1.0, 1.4, 3.3, 0], ['fern', 3.8, -.1, 1.35, .8, 0],
    ['fern', -2.4, -13.8, 1.8, 2.3, 0], ['fern', 11.8, -16.5, 1.5, 1.8, 0],
    ['treeFern', -3.2, -15.2, 1.2, 1.6, 1], ['treeFern', 14.2, -17, 1.15, .5, 1],
    ['treeFern', -2.5, -29.8, 1.4, 2.4, 1], ['treeFern', 11.2, -29.8, 1.5, 1.3, 1],
    ['cycad', -2.4, -23.4, 1.1, .4, 1], ['cycad', 11.3, -23.4, 1.1, 2.4, 1],
    ['fern', -1.8, -16.4, 1.5, 2.3, 1], ['fern', 12.3, -16.2, 1.6, .4, 1],
    ['fern', -2, -26.6, 1.8, 1.3, 1], ['fern', 11, -26.6, 1.7, 2.1, 1],
  ];
  const tint = new THREE.Color();
  plants.forEach(([kind, x, z, scale, yaw, lod], variant) => {
    if (avoid(x, z, scale * .55)) return;
    const model = kind === 'fern' ? roundedFern(variant % 3) : library.get(kind, variant % 3, lod), cos = Math.cos(yaw), sin = Math.sin(yaw), y = world.heightAt(x, z) + .045;
    if (model.solid?.pos.length) solidBounds(`glade-${kind}-${variant}`, model.solid.pos, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(scale, scale, scale)));
    for (const part of ['solid', 'thin']) {
      const source = model[part]; if (!source) continue;
      const batch = botanical[part], offset = batch.p.length / 3;
      for (let i = 0; i < source.pos.length; i += 3) {
        batch.p.push(x + (source.pos[i] * cos + source.pos[i + 2] * sin) * scale, y + source.pos[i + 1] * scale, z + (source.pos[i + 2] * cos - source.pos[i] * sin) * scale);
        batch.n.push(source.nrm[i] * cos + source.nrm[i + 2] * sin, source.nrm[i + 1], source.nrm[i + 2] * cos - source.nrm[i] * sin);
        tint.setRGB(source.col[i], source.col[i + 1], source.col[i + 2]).convertSRGBToLinear(); batch.c.push(tint.r, tint.g, tint.b);
      }
      for (const index of source.idx) batch.i.push(index + offset);
    }
  });
  for (const [part, batch] of Object.entries(botanical)) {
    if (!batch.i.length) continue;
    const g = geometry(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(batch.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(batch.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(batch.c, 3)); g.setIndex(batch.i); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material({ vertexColors: true, side: part === 'thin' ? THREE.DoubleSide : THREE.FrontSide })); mesh.name = `Rjóðurburknar · ${part}`; mesh.receiveShadow = true; mesh.castShadow = part === 'solid'; root.add(mesh);
  }

  // All these matte, static plants share two colour batches: opaque pieces
  // that cast a small shadow, and soft two-sided foliage. Their painted vertex
  // colours survive the merge, including the per-instance moss/leaf tints.
  const sceneryBatches = new Map(), worldMatrix = new THREE.Matrix4(), instanceMatrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), position = new THREE.Vector3(), normal = new THREE.Vector3(), instanceTint = new THREE.Color(), vertexTint = new THREE.Color();
  root.updateMatrixWorld(true);
  for (const source of [...root.children]) {
    if (!source.isMesh) continue;
    const key = source.castShadow ? 'solid' : 'foliage';
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
    const mesh = new THREE.Mesh(g, material({ vertexColors: true, side: key === 'solid' ? THREE.FrontSide : THREE.DoubleSide })); mesh.name = `Rjóðurskraut · ${key}`; mesh.castShadow = key === 'solid'; mesh.receiveShadow = true; root.add(mesh);
    if(key==='foliage')breezeMaterials.push(installStoryBreeze(mesh.material,g,world.heightAt));
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
