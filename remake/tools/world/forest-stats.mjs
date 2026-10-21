#!/usr/bin/env node
// Builds the forest in node (no GPU) and prints placements, rejections, build time and an
// estimate of the triangles and draw calls each review shot submits (frustum-culled buckets plus
// the grass draw ranges), plus the forest's own shadow casters for the review-mode shadow focus
// (10 m around the clearing centre), so "forest" matches the budget's forest share. Fast feedback
// between browser captures.
//   node remake/tools/world/forest-stats.mjs [--quality tablet|low|high] [--chapter grunnur] [--location <name>]
// --location measures one place of a chapter that has `locations` (kafli1: --location burknalaut): the forest is built from that
// location's layout with its own shots, as main.js builds it, and the shots measured are that location's.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const threeUrl = pathToFileURL(path.join(ROOT, 'dist/vendor/three.module.js')).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
  return next(specifier, context);
}`)}`);

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const quality = opt('quality', 'tablet');
const chapterId = opt('chapter', 'grunnur');

const THREE = await import('three');
const { PRESETS } = await import(pathToFileURL(path.join(ROOT, 'remake/engine/quality.js')).href);
const { pickLook } = await import(pathToFileURL(path.join(ROOT, 'remake/engine/looks.js')).href);
const { sunDirection } = await import(pathToFileURL(path.join(ROOT, 'remake/engine/lighting.js')).href);
const { createWind } = await import(pathToFileURL(path.join(ROOT, 'remake/engine/wind.js')).href);
const { chapter } = await import(pathToFileURL(path.join(ROOT, `remake/chapters/${chapterId}.js`)).href);
const locationName = opt('location', null);
const locationNames = Object.keys(chapter.locations || {});
if (locationName ? !locationNames.includes(locationName) : !chapter.layout) {
  console.error(locationName
    ? `Chapter ${chapter.id} has no location "${locationName}" (it has ${locationNames.join(', ') || 'none'})`
    : `Chapter ${chapter.id} builds a forest for each of its locations: pick one with --location (${locationNames.join(', ')})`);
  process.exit(1);
}
// what main.js and engine/locations.js build a forest from: the chapter's layout, or a location's with its own shots in layout.shots
const place = locationName ? chapter.locations[locationName] : null;
const layout = place ? { ...place.layout, shots: place.shots ?? {} } : chapter.layout;
const shots = place ? place.shots ?? {} : chapter.shots;
const { createForest } = await import(pathToFileURL(path.join(ROOT, 'remake/world/forest/forest.js')).href);
const { shotStats } = await import(pathToFileURL(path.join(ROOT, 'remake/tools/world/shot-stats.mjs')).href);

const q = PRESETS[quality];
const look = pickLook(chapter.look);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200);
// a stand-in sun: the forest culls its casters against the shadow focus (review mode: 10 m at 0,0)
const sun = { castShadow: true, target: { position: new THREE.Vector3(...(layout.clearing.center.length === 2 ? [layout.clearing.center[0], 0, layout.clearing.center[1]] : [0, 0, 0])) }, shadow: { updateMatrices() {} } };
const world = {
  THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene, camera, clock: null, q,
  params: new URLSearchParams(''), look, lighting: { direction: sunDirection(look), sun, focusRadius: 10 }, wind: createWind(), chapter,
  heightAt: () => 0, actors: new Map(),
};
const t0 = performance.now();
const forest = await createForest(world, layout);
console.log(`built in ${Math.round(performance.now() - t0)} ms (${quality}${locationName ? `, ${chapter.id}/${locationName}` : ''})`);
console.log('placements', forest.info.placements);
console.log('rejected', forest.info.rejected);
console.log(`grass ${forest.info.grassBlades} blades, ${forest.info.grassTriangles} tris max; ground ${forest.info.groundTriangles}; far ${forest.info.farTriangles}`);
if (forest.water) console.log(`water ${forest.water.triangles} tris; mist ${forest.mists.map(m => `${m.cards} cards`).join(', ') || 'none'}; hanging moss ${forest.info.mossCards} cards`);
const byBand = {};
for (const m of forest.info.meshes) {
  const band = m.name.split(' ')[1].split(':')[0];
  byBand[band] = byBand[band] || { meshes: 0, tris: 0 };
  byBand[band].meshes++; byBand[band].tris += m.tris;
}
console.log('buckets by band', byBand);
if (args.includes('--models')) {
  const per = {};
  for (const p of forest.info.placementList || []) { const k = p.name + ' lod' + p.lod; per[k] = per[k] || { n: 0, tris: 0 }; per[k].n++; per[k].tris += p.tris; }
  console.log(per);
}

for (const [name, s] of Object.entries(shots)) {
  if (!Array.isArray(s.position) || !Array.isArray(s.target)) continue;
  const { calls, triangles, main, casters, parts } = shotStats(world, forest, s);
  if (args.includes('--species') && name === (opt('species', 'hero'))) {
    const per = {};
    forest.group.traverse(o => { const k = o.userData?.cull?.kept; if (!k || !o.visible) return; for (const r of k) { const key = r.name + ' lod' + r.lod; per[key] = (per[key] || 0) + r.count / 3; } });
    console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round(v / 100) / 10 + 'k').join(', '));
  }
  console.log(`${name.padEnd(9)} forest ${String(calls).padStart(3)} / ${String(triangles).padStart(7)}  (main ${main.calls} / ${main.triangles}, casters ${casters.calls} / ${casters.triangles})  ` + Object.entries(parts).map(([k, v]) => `${k} ${v[0]}/${Math.round(v[1] / 1000)}k`).join('  '));
}
