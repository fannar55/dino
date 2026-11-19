#!/usr/bin/env node
// Prepares an AssetHub / Tripo3D critter GLB (`snigill`, `bjalla`, `skjaldbaka`, or `fugl`) into a low-poly,
// UV-baked, morph/wing-ready game asset in `remake/assets/critters/<kind>.glb`:
//   node remake/tools/prep-critter.mjs --kind <snigill|bjalla|skjaldbaka|fugl> <in.glb> <out.glb> [--preview <dir>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const argv = process.argv.slice(2);
const FLAGS = new Set(['--kind', '--length', '--wingspan', '--near', '--far', '--tex', '--until', '--preview', '--report', '--blender']);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (FLAGS.has(argv[i])) { i++; continue; }
  positional.push(argv[i]);
}
const [input, output] = positional;
const kind = opt('kind');
if (!kind || !input || !output) {
  console.error('usage: prep-critter.mjs --kind <snigill|bjalla|skjaldbaka|fugl> <in.glb> <out.glb> [--preview <dir>]');
  process.exit(1);
}

const until = Number(opt('until', '30'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `prep-${kind}-`));
const raw = path.join(tmp, 'raw.glb');
const report = opt('report', path.join(tmp, 'report.json'));

// ---- 1. Blender low-poly decimation, atlas bake, morphs & previews ----------------------------------------------------------
const passed = ['kind', 'length', 'wingspan', 'near', 'far', 'tex', 'preview']
  .flatMap(name => opt(name) === null ? [] : [`--${name}`, opt(name)]);
const blender = spawnSync(opt('blender', BLENDER), [
  '-b', '--factory-startup', '--python', path.join(HERE, 'blender-critter.py'), '--',
  path.resolve(input), raw, ...passed, '--report', report,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
for (const line of `${blender.stdout}\n${blender.stderr}`.split('\n')) {
  if (new RegExp(`^\\[${kind}\\]|Error|Traceback|^\\s+File `).test(line)) console.log(line);
}
if (blender.status !== 0 || !fs.existsSync(raw)) {
  console.error(blender.stderr || blender.stdout);
  throw new Error(`Blender failed for ${kind} (${blender.status})`);
}
const made = JSON.parse(fs.readFileSync(report, 'utf8'));

// ---- 2. Inject `_WING` float attribute on winged critters (`fugl`), scene extras, and quantize ------------------------------
const glb = fs.readFileSync(raw);
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const binOffset = 20 + jsonLength + 8;
let bin = glb.subarray(binOffset, binOffset + glb.readUInt32LE(20 + jsonLength));

if (made.wing) {
  const { cutX, cutY, cutZ } = made.wing;
  const extraChunks = [];
  let byteOffset = bin.length;
  const pad4 = n => (4 - (n % 4)) % 4;
  const alignPad = pad4(byteOffset);
  if (alignPad) {
    extraChunks.push(Buffer.alloc(alignPad));
    byteOffset += alignPad;
  }

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const posAcc = json.accessors[prim.attributes.POSITION];
      const posView = json.bufferViews[posAcc.bufferView];
      const stride = posView.byteStride || 12;
      const start = (posView.byteOffset || 0) + (posAcc.byteOffset || 0);
      const count = posAcc.count;
      const tags = new Float32Array(count);
      let minTag = 0;
      let maxTag = 0;
      for (let i = 0; i < count; i++) {
        const off = start + i * stride;
        const [gx, gy, gz] = [bin.readFloatLE(off), bin.readFloatLE(off + 4), bin.readFloatLE(off + 8)];
        const tag = (Math.abs(gz) > cutZ && gx > cutX && gy > cutY) ? (gz > 0 ? 1 : -1) : 0;
        tags[i] = tag;
        if (tag < minTag) minTag = tag;
        if (tag > maxTag) maxTag = tag;
      }
      const bytes = Buffer.from(tags.buffer, tags.byteOffset, tags.byteLength);
      extraChunks.push(bytes);
      const viewIndex = json.bufferViews.length;
      json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target: 34962 });
      byteOffset += bytes.length;
      const accIndex = json.accessors.length;
      json.accessors.push({
        bufferView: viewIndex,
        componentType: 5126,
        count,
        type: 'SCALAR',
        min: [minTag],
        max: [maxTag],
      });
      prim.attributes._WING = accIndex;
    }
  }
  bin = Buffer.concat([bin, ...extraChunks]);
  json.buffers[0].byteLength = bin.length;
}

const scene = json.scenes[json.scene ?? 0];
scene.extras = {
  morphs: made.morphs,
  length: made.length,
  width: made.width,
  height: made.height,
  pivot: made.pivot,
  ...(made.wing ? { wing: { shoulder: made.wing.shoulder, fold: made.wing.fold } } : {}),
  source: path.basename(input),
};
for (const node of json.nodes) if (node.name === 'near') node.extras = { ...node.extras, until };
for (const mesh of json.meshes) delete mesh.weights;
json.asset.generator = `${json.asset.generator ?? ''} + remake/tools/prep-critter.mjs`;

let text = Buffer.from(JSON.stringify(json), 'utf8');
if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
const binPad = (4 - (bin.length % 4)) % 4;
const binChunk = Buffer.alloc(8);
binChunk.writeUInt32LE(bin.length + binPad, 0);
binChunk.writeUInt32LE(0x004e4942, 4);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + text.length + 8 + bin.length + binPad, 8);
header.writeUInt32LE(text.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const withExtras = path.join(tmp, 'extras.glb');
fs.writeFileSync(withExtras, Buffer.concat([header, text, binChunk, bin, Buffer.alloc(binPad)]));

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
const pack = spawnSync(process.execPath, [path.join(HERE, 'quantize-glb.mjs'), withExtras, path.resolve(output)], { encoding: 'utf8' });
process.stdout.write(pack.stdout);
if (pack.status !== 0) throw new Error(`quantize-glb failed: ${pack.stderr}`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`${output}: ${made.length} m long, ${made.width} m wide, ${made.height} m tall (pivot ${made.pivot}); ` +
  `near ${made.near.triangles} tris, far ${made.far.triangles} tris; morphs [${made.morphs.join(', ')}]; ` +
  `${(fs.statSync(output).size / 1024).toFixed(1)} KB`);
