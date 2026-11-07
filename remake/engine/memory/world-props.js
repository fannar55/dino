import * as THREE from 'three';

const colour = hex => new THREE.Color(hex);
const clamp = THREE.MathUtils.clamp;
const LEAF_LENGTH = 2.6, LEAF_WIDTH = 1.3;
const leafHeight = (t, s) => Math.pow(Math.sin(t * Math.PI), .85) * (.81 - .80 * Math.pow(Math.abs(s), .9) - .07 * s) - .22 + Math.sin(t * Math.PI * 4) * .025 * s * s;
const leafWidth = t => LEAF_WIDTH * Math.pow(Math.sin(Math.PI * (t * .94 + .025)), .67);
const leafX = (t, s) => leafWidth(t) * (s + .09 * Math.sin(t * Math.PI) * (1 - Math.abs(s)));

/** One thick, gently folded broad leaf. Every hiding place shares this geometry. */
export function createLeafResources() {
  const geometry = new THREE.BufferGeometry(), positions = [], colours = [], indices = [], uvs = [];
  const rows = 18, columns = 10;
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
  veinParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(centre), 14, .024, 4, false));
  for (let k = 1; k <= 6; k++) for (const sign of [-1, 1]) {
    const t = .1 + k * .105, points = [];
    for (let j = 0; j <= 10; j++) {
      const s = j / 10 * .91, at = Math.min(.98, t + .115 * s);
      const y = leafHeight(at, sign * s) + .023;
      points.push(new THREE.Vector3(leafX(at, sign * s), y, at * LEAF_LENGTH));
    }
    veinParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 5, .012, 3, false));
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
    data[i] = 46; data[i + 1] = 33; data[i + 2] = 18; data[i + 3] = Math.round(Math.pow(Math.max(0, 1 - d), 1.9) * 122);
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
