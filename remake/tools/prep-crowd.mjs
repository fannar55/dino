#!/usr/bin/env node
// The owner's Tripo3D model of an animal -> a crowd model for the crowds (world/critters/crowd.js, loaded by
// world/critters/crowd-models.js): two levels of detail, each clip frozen into morph targets <clip>.<k>, one small texture.
//
//   node remake/tools/prep-crowd.mjs <in.glb> <out.glb> --rig remake/tools/crowd-rigs/smaedla.json --length 0.8
//     [--clips run,idle,drink,look] [--frames 8] [--near 800] [--far 250] [--tex 512] [--until 30]
//     [--seconds run=0.45,idle=3] [--report <file.json>] [--blend <file.blend>]
//
// The rig's "kind" picks the clips it can make: a tailed biped (smaedla) runs, idles, drinks and looks; a quadruped
// (grasbitur.json) walks, trots, grazes and looks (by default all four of its kind).
//
// Step 1, Blender in the background (remake/tools/blender-crowd.py): faces +X, --length metres nose to tail, feet on y = 0; a near
// mesh of at most --near triangles and a far one of at most --far; the base colour baked to --tex px (the other maps dropped); the
// rig file's skeleton with automatic weights; each clip posed at --frames even steps and frozen into shape keys. Step 2, here:
// the scene's extras { clips: { <clip>: { frames, seconds } }, length, height, pivot } and the near mesh's { until } (metres from
// the camera it is drawn within; the far mesh beyond), then remake/tools/quantize-glb.mjs packs it small.
// --report keeps Blender's report (triangles, joints, how far planted feet moved, how far each frame is from the next); --blend
// keeps the rigged scene to look at. The owner's file is only read.
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
if (!input || !output || !opt('rig')) {
  console.error('usage: prep-crowd.mjs <in.glb> <out.glb> --rig <rig.json> --length 0.8 [options]');
  process.exit(1);
}
const until = Number(opt('until', '30'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-crowd-'));
const raw = path.join(tmp, 'raw.glb');
const report = opt('report', path.join(tmp, 'report.json'));

// ---- 1. Blender -------------------------------------------------------------------------------------------------------------
const passed = ['rig', 'length', 'clips', 'frames', 'near', 'far', 'tex', 'seconds', 'blend', 'head-detail', 'far-head-detail']
  .flatMap(name => opt(name, null) === null ? [] : [`--${name}`, opt(name)]);
const blender = spawnSync(opt('blender', BLENDER), ['-b', '--factory-startup', '--python', path.join(HERE, 'blender-crowd.py'), '--',
  path.resolve(input), raw, ...passed, '--report', report], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
for (const line of `${blender.stdout}\n${blender.stderr}`.split('\n')) if (/^\[crowd\]|Error|Traceback|^\s+File /.test(line)) console.log(line);
if (blender.status !== 0 || !fs.existsSync(raw)) throw new Error(`Blender failed (${blender.status})`);
const made = JSON.parse(fs.readFileSync(report, 'utf8'));

// ---- 2. extras, then pack -----------------------------------------------------------------------------------------------------
const glb = fs.readFileSync(raw);
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const rest = glb.subarray(20 + jsonLength);
const clips = Object.fromEntries(Object.entries(made.clips).map(([clip, { frames, seconds, stride }]) =>
  [clip, stride === undefined ? { frames, seconds } : { frames, seconds, stride }]));
const scene = json.scenes[json.scene ?? 0];
scene.extras = { clips, length: made.length, height: made.height, pivot: made.pivot, source: path.basename(input) };
for (const node of json.nodes) if (node.name === 'near') node.extras = { ...node.extras, until };
for (const mesh of json.meshes) delete mesh.weights; // every frame at 0: the crowd sets each critter's own
json.asset.generator = `${json.asset.generator ?? ''} + remake/tools/prep-crowd.mjs`;
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

console.log(`${output}: ${made.length} m long, ${made.height} m tall; near ${made.near.triangles} triangles, far ${made.far.triangles}; ` +
  `clips ${Object.entries(clips).map(([c, { frames, seconds }]) => `${c} ${frames} x ${seconds} s`).join(', ')}; ` +
  `${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
for (const warning of made.warnings) console.log(`  note: ${warning}`);
