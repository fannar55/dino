#!/usr/bin/env node
// Prepares the AssetHub / Tripo3D frog GLB into a low-poly, rigged, morph-animated game asset
// (`remake/assets/critters/froskur.glb`, loaded by `world/critters/critters.js` and `world/ardalur/animals.js`):
//   node remake/tools/prep-frog.mjs <in.glb> <out.glb> [--length 0.22] [--near 680] [--far 240] [--tex 512] [--until 30] [--preview <dir>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const argv = process.argv.slice(2);
const [input, output] = argv;
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
if (!input || !output) {
  console.error('usage: prep-frog.mjs <in.glb> <out.glb> [--length 0.22] [--near 680] [--far 240] [--tex 512] [--until 30] [--preview <dir>]');
  process.exit(1);
}
const until = Number(opt('until', '30'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-frog-'));
const raw = path.join(tmp, 'raw.glb');
const report = opt('report', path.join(tmp, 'report.json'));

// ---- 1. Blender low-poly decimation, atlas bake, rigging & morph poses ------------------------------------------------------
const passed = ['length', 'near', 'far', 'tex', 'preview']
  .flatMap(name => opt(name, null) === null ? [] : [`--${name}`, opt(name)]);
const blender = spawnSync(opt('blender', BLENDER), [
  '-b', '--factory-startup', '--python', path.join(HERE, 'blender-frog.py'), '--',
  path.resolve(input), raw, ...passed, '--report', report,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
for (const line of `${blender.stdout}\n${blender.stderr}`.split('\n')) {
  if (/^\[frog\]|Error|Traceback|^\s+File /.test(line)) console.log(line);
}
if (blender.status !== 0 || !fs.existsSync(raw)) {
  console.error(blender.stderr || blender.stdout);
  throw new Error(`Blender failed (${blender.status})`);
}
const made = JSON.parse(fs.readFileSync(report, 'utf8'));

// ---- 2. Scene extras, LOD switch distance, and KHR_mesh_quantization packing ------------------------------------------------
const glb = fs.readFileSync(raw);
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const rest = glb.subarray(20 + jsonLength);
const scene = json.scenes[json.scene ?? 0];
scene.extras = {
  morphs: made.morphs,
  length: made.length,
  width: made.width,
  height: made.height,
  pivot: made.pivot,
  source: path.basename(input),
};
for (const node of json.nodes) if (node.name === 'near') node.extras = { ...node.extras, until };
for (const mesh of json.meshes) delete mesh.weights;
json.asset.generator = `${json.asset.generator ?? ''} + remake/tools/prep-frog.mjs`;

let text = Buffer.from(JSON.stringify(json), 'utf8');
if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + text.length + rest.length, 8);
header.writeUInt32LE(text.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const withExtras = path.join(tmp, 'extras.glb');
fs.writeFileSync(withExtras, Buffer.concat([header, text, rest]));
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
const pack = spawnSync(process.execPath, [path.join(HERE, 'quantize-glb.mjs'), withExtras, path.resolve(output)], { encoding: 'utf8' });
process.stdout.write(pack.stdout);
if (pack.status !== 0) throw new Error(`quantize-glb failed: ${pack.stderr}`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`${output}: ${made.length} m long, ${made.width} m wide, ${made.height} m tall; ` +
  `near ${made.near.triangles} tris, far ${made.far.triangles} tris; morphs [${made.morphs.join(', ')}]; ` +
  `${(fs.statSync(output).size / 1024).toFixed(1)} KB`);
