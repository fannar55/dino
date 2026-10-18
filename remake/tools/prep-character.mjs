#!/usr/bin/env node
// Prepares a Tripo3D character GLB for the remake, without touching its meshes, skins or clips:
// it stands the model on the ground at the origin, scales it to a height in metres, turns it to
// face +X (the remake's convention), resizes its textures and sets a matte material.
//
//   node remake/tools/prep-character.mjs <in.glb> <out.glb> --height 1.1 --yaw 90
//     [--name Egill] [--tex 1024] [--quality 3] [--roughness 0.65]
//     [--normal-image 0 --normal-scale 0.6]   wire image 0 as the normal map if the material has none
//     [--drop-normal]                          remove the normal map
//     [--keep-metal-rough]                     keep the metal-roughness texture (dropped by default)
//     [--single-sided]                         render front faces only (cheaper; needs a closed mesh)
//
// --yaw is the turn in degrees about +Y that brings the model's front to +X: Tripo exports face +Z,
// so 90 is right for them. Mesh decimation is a separate step (Blender, see remake/README.md).
// Needs ffmpeg on the PATH for the texture resize.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const [input, output] = argv;
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = name => argv.includes(`--${name}`);
if (!input || !output) {
  console.error('usage: prep-character.mjs <in.glb> <out.glb> --height 1.1 --yaw 90 [options]');
  process.exit(1);
}
const height = Number(opt('height', '1'));
const yaw = (Number(opt('yaw', '0')) * Math.PI) / 180;
const texSize = Number(opt('tex', '1024'));
const quality = opt('quality', '3');
const roughness = Number(opt('roughness', '0.65'));
const normalImage = opt('normal-image', null);
const normalScale = Number(opt('normal-scale', '0.6'));
const name = opt('name', path.basename(output, '.glb'));

// --- read -------------------------------------------------------------------------------------
const glb = fs.readFileSync(input);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file');
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const binHeader = 20 + jsonLength;
const bin = glb.subarray(binHeader + 8, binHeader + 8 + glb.readUInt32LE(binHeader));
const views = json.bufferViews.map(v => Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)));

// --- small matrix helpers (column-major 4x4, like glTF) ---------------------------------------
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function compose(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

// --- bounds of every mesh in the scene, in scene space ----------------------------------------
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
function visit(index, parent) {
  const node = json.nodes[index];
  const world = multiply(parent, compose(node));
  if (node.mesh !== undefined) {
    for (const prim of json.meshes[node.mesh].primitives) {
      const a = json.accessors[prim.attributes.POSITION];
      for (let i = 0; i < 8; i++) {
        const corner = [i & 1 ? a.max[0] : a.min[0], i & 2 ? a.max[1] : a.min[1], i & 4 ? a.max[2] : a.min[2]];
        apply(world, corner).forEach((v, k) => { min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v); });
      }
    }
  }
  for (const child of node.children || []) visit(child, world);
}
const scene = json.scenes[json.scene ?? 0];
scene.nodes.forEach(n => visit(n, identity()));
const scale = height / (max[1] - min[1]);
const floor = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];

// A new root: scale, then turn about +Y, with the feet centre moved to the origin.
const half = yaw / 2;
const rotation = [0, Math.sin(half), 0, Math.cos(half)];
const rootMatrix = compose({ rotation, scale: [scale, scale, scale] });
const moved = apply(rootMatrix, floor).map(v => -v);
json.nodes.push({ name, translation: moved, rotation, scale: [scale, scale, scale], children: scene.nodes.slice() });
scene.nodes = [json.nodes.length - 1];

// --- material: matte, optional normal map, no metal-roughness map ------------------------------
const usedImages = new Set();
for (const material of json.materials || []) {
  const pbr = (material.pbrMetallicRoughness ||= {});
  pbr.metallicFactor = 0;
  if (flag('single-sided')) material.doubleSided = false;
  if (flag('drop-normal')) delete material.normalTexture;
  else if (material.normalTexture && !Number.isNaN(normalScale)) material.normalTexture.scale = normalScale;
  pbr.roughnessFactor = roughness;
  if (!flag('keep-metal-rough')) delete pbr.metallicRoughnessTexture;
  if (normalImage !== null && !material.normalTexture) {
    let texture = json.textures.findIndex(t => t.source === Number(normalImage));
    if (texture < 0) texture = json.textures.push({ source: Number(normalImage) }) - 1;
    material.normalTexture = { index: texture, scale: normalScale };
  }
  for (const ref of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) {
    if (ref) usedImages.add(json.textures[ref.index].source);
  }
}

// Drop images and textures nothing uses any more, renumbering the rest.
const keptImages = (json.images || []).map((_, i) => i).filter(i => usedImages.has(i));
const imageIndex = new Map(keptImages.map((old, i) => [old, i]));
const keptTextures = (json.textures || []).map((t, i) => [t, i]).filter(([t]) => imageIndex.has(t.source));
const textureIndex = new Map(keptTextures.map(([, old], i) => [old, i]));
for (const material of json.materials || []) {
  const pbr = material.pbrMetallicRoughness;
  for (const ref of [pbr?.baseColorTexture, pbr?.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) {
    if (ref) ref.index = textureIndex.get(ref.index);
  }
}
const droppedViews = new Set((json.images || []).filter((_, i) => !imageIndex.has(i)).map(im => im.bufferView));
json.textures = keptTextures.map(([t]) => ({ ...t, source: imageIndex.get(t.source) }));
json.images = keptImages.map(i => json.images[i]);

// --- textures: resize with ffmpeg ---------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-character-'));
json.images.forEach((image, i) => {
  if (image.bufferView === undefined) return;
  const source = path.join(tmp, `in${i}.${image.mimeType === 'image/png' ? 'png' : 'jpg'}`);
  const target = path.join(tmp, `out${i}.jpg`);
  fs.writeFileSync(source, views[image.bufferView]);
  const run = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-vf', `scale=${texSize}:${texSize}:flags=lanczos`, '-q:v', quality, target]);
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
  views[image.bufferView] = fs.readFileSync(target);
  image.mimeType = 'image/jpeg';
});
fs.rmSync(tmp, { recursive: true, force: true });

// --- rebuild the binary chunk without the dropped images ---------------------------------------
const viewIndex = new Map();
const newViews = [];
const parts = [];
let offset = 0;
json.bufferViews.forEach((view, i) => {
  if (droppedViews.has(i)) return;
  const data = views[i];
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
  viewIndex.set(i, newViews.length);
  newViews.push({ ...view, buffer: 0, byteOffset: offset, byteLength: data.length });
  parts.push(data);
  offset += data.length;
});
for (const accessor of json.accessors || []) if (accessor.bufferView !== undefined) accessor.bufferView = viewIndex.get(accessor.bufferView);
for (const image of json.images) if (image.bufferView !== undefined) image.bufferView = viewIndex.get(image.bufferView);
json.bufferViews = newViews;
let binOut = Buffer.concat(parts);
if (binOut.length % 4) binOut = Buffer.concat([binOut, Buffer.alloc(4 - (binOut.length % 4))]);
json.buffers = [{ byteLength: binOut.length }];
json.asset = { ...json.asset, generator: `${json.asset?.generator || 'unknown'}; remake/tools/prep-character.mjs` };

// --- write -------------------------------------------------------------------------------------
let text = Buffer.from(JSON.stringify(json), 'utf8');
if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + text.length + 8 + binOut.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(text.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(binOut.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, jsonHeader, text, binChunkHeader, binOut]));
console.log(`${output}: ${(max[1] - min[1]).toFixed(3)} -> ${height} m (scale ${scale.toFixed(4)}), yaw ${opt('yaw', '0')} deg, ` +
  `${json.images.length} textures at ${texSize} px, ${(fs.statSync(output).size / 1048576).toFixed(2)} MB`);
