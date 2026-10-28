#!/usr/bin/env node
// Packs a GLB's vertices small with KHR_mesh_quantization, which three's GLTFLoader reads as it is (no
// decoder to fetch, unlike Draco): positions as 16-bit integers over the model's extent (each mesh's node
// scales them back), normals as 8-bit, texture coordinates as 16-bit where they lie in 0..1, indices as
// 16-bit where they fit. Images, materials, nodes and extras are kept as they are. Step 2 of preparing
// the hero butterfly (remake/tools/blender-butterfly.py is step 1).
//   node remake/tools/quantize-glb.mjs <in.glb> <out.glb>
import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: quantize-glb.mjs <in.glb> <out.glb>');
  process.exit(1);
}

const SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

const glb = fs.readFileSync(input);
if (glb.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${input} is not a GLB`);
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
const binStart = 20 + jsonLength + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLength));

/** An accessor's values as a flat array of numbers (strided buffer views read element by element). */
function read(index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const n = COUNTS[a.type], size = SIZES[a.componentType];
  const stride = view.byteStride || n * size;
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Array(a.count * n);
  for (let i = 0; i < a.count; i++) {
    const element = new TYPED[a.componentType](bin.buffer, bin.byteOffset + start + i * stride, n);
    for (let k = 0; k < n; k++) out[i * n + k] = element[k];
  }
  return out;
}

// The new binary: images' views first, as they are, then the packed vertex data, each view aligned to 4 bytes.
const chunks = [];
const views = [];
let offset = 0;
function addView(bytes, extra = {}) {
  const pad = (4 - (bytes.length % 4)) % 4;
  chunks.push(bytes, Buffer.alloc(pad));
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...extra });
  offset += bytes.length + pad;
  return views.length - 1;
}
const accessors = [];
function addAccessor(values, { type, componentType, normalized = false, target, stride }) {
  const n = COUNTS[type];
  const count = values.length / n;
  const Typed = TYPED[componentType];
  const size = SIZES[componentType];
  const byteStride = stride ?? n * size;
  const bytes = Buffer.alloc(count * byteStride);
  const min = new Array(n).fill(Infinity), max = new Array(n).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    const element = new Typed(bytes.buffer, bytes.byteOffset + i * byteStride, n);
    for (let k = 0; k < n; k++) {
      const v = values[i * n + k];
      element[k] = v;
      min[k] = Math.min(min[k], element[k]);
      max[k] = Math.max(max[k], element[k]);
    }
  }
  const view = { target };
  if (byteStride !== n * size) view.byteStride = byteStride;
  const bufferView = addView(bytes, view);
  accessors.push({ bufferView, componentType, count, type, min, max, ...(normalized ? { normalized } : {}) });
  return accessors.length - 1;
}

const imageViews = new Map();
for (const image of json.images ?? []) {
  if (image.bufferView == null) continue;
  const view = json.bufferViews[image.bufferView];
  imageViews.set(image.bufferView, addView(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)));
  image.bufferView = imageViews.get(image.bufferView);
}

// Every position in the file shares one extent, so every mesh's node gets the same scale.
let extent = 0;
for (const mesh of json.meshes) for (const p of mesh.primitives) {
  const a = json.accessors[p.attributes.POSITION];
  extent = Math.max(extent, ...a.min.map(Math.abs), ...a.max.map(Math.abs));
}
const quantize = (values, scale) => values.map(v => Math.round(v * scale));
const stats = { positions: 0, triangles: 0 };
const converted = new Map(); // old accessor -> new, where two primitives share one
function convert(index, attribute) {
  const key = `${index}:${attribute}`;
  if (converted.has(key)) return converted.get(key);
  const a = json.accessors[index];
  const values = read(index);
  let result;
  if (attribute === 'POSITION') {
    result = addAccessor(quantize(values, 32767 / extent), { type: 'VEC3', componentType: 5122, normalized: true, target: 34962 });
    stats.positions += a.count;
  } else if (attribute === 'NORMAL') {
    result = addAccessor(quantize(values, 127), { type: 'VEC3', componentType: 5120, normalized: true, target: 34962, stride: 4 });
  } else if (attribute.startsWith('TEXCOORD') && values.every(v => v >= 0 && v <= 1)) {
    result = addAccessor(quantize(values, 65535), { type: 'VEC2', componentType: 5123, normalized: true, target: 34962 });
  } else if (attribute === 'INDICES') {
    const wide = values.some(v => v > 65534);
    result = addAccessor(values, { type: 'SCALAR', componentType: wide ? 5125 : 5123, target: 34963 });
    stats.triangles += a.count / 3;
  } else {
    result = addAccessor(values, { type: a.type, componentType: a.componentType, normalized: a.normalized, target: 34962 });
  }
  converted.set(key, result);
  return result;
}

const scaled = new Set();
for (const mesh of json.meshes) {
  for (const p of mesh.primitives) {
    for (const [attribute, index] of Object.entries(p.attributes)) p.attributes[attribute] = convert(index, attribute);
    if (p.indices != null) p.indices = convert(p.indices, 'INDICES');
    if (p.targets) throw new Error('morph targets are not packed here');
  }
}
for (const node of json.nodes) {
  if (node.mesh == null || node.skin != null) continue;
  if (node.matrix) throw new Error('a mesh node with a matrix is not packed here');
  node.scale = (node.scale ?? [1, 1, 1]).map(s => s * extent);
  scaled.add(node.name);
}
if (json.skins?.length) throw new Error('skinned meshes are not packed here');

json.bufferViews = views;
json.accessors = accessors;
json.buffers = [{ byteLength: offset }];
json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'KHR_mesh_quantization'])];
json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'KHR_mesh_quantization'])];
json.asset.generator = `${json.asset.generator ?? ''} + remake/tools/quantize-glb.mjs`.replace(/^ \+ /, '');

const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
const binBytes = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBytes.length + jsonPad + 8 + binBytes.length, 8);
const jsonChunk = Buffer.alloc(8);
jsonChunk.writeUInt32LE(jsonBytes.length + jsonPad, 0);
jsonChunk.write('JSON', 4, 'ascii');
const binChunk = Buffer.alloc(8);
binChunk.writeUInt32LE(binBytes.length, 0);
binChunk.write('BIN\0', 4, 'ascii');
fs.writeFileSync(output, Buffer.concat([header, jsonChunk, jsonBytes, Buffer.alloc(jsonPad, 0x20), binChunk, binBytes]));
console.log(`[quantize] ${glb.length} -> ${fs.statSync(output).size} bytes: ${stats.positions} vertices, ${stats.triangles} triangles, ` +
  `extent ${extent.toFixed(4)} on nodes ${[...scaled].join(', ')}, images ${imageViews.size}`);
