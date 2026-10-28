// What a forest costs from one shot, in Node with no GPU: the draw calls and triangles of its main pass (each mesh or set of
// points that is shown and in the shot's frustum, at the index range its cull left it) plus its shadow casters for the shadow
// focus the world's sun has (review mode: 10 m round the clearing's centre). tools/world/forest-stats.mjs prints it for every
// shot of a place, and tests/fen.test.mjs holds the Fen's shots to the forest's share of the budget with it (STYLE.md 11).
//
//   shotStats(world, forest, shot) -> { calls, triangles, main: { calls, triangles }, casters: { calls, triangles }, grass, parts }
//
// `shot` is a static one ({ position, target, fov }); the camera is world.camera at 16:10. `parts` sums calls and triangles by
// what they are: a forest bucket's band (clearing, edge, inner, deep), or the first word of any other mesh's name.
import * as THREE from 'three';

const frustum = new THREE.Frustum();
const m4 = new THREE.Matrix4();
const sphere = new THREE.Sphere();

export function shotStats(world, forest, shot) {
  const camera = world.camera;
  camera.fov = shot.fov ?? 40;
  camera.aspect = 1.6;
  camera.position.fromArray(shot.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new THREE.Vector3().fromArray(shot.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  forest.update(0, 0);
  forest.group.updateMatrixWorld(true);
  m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(m4);
  let calls = 0, triangles = 0, grass = 0;
  const parts = {};
  forest.group.traverseVisible(o => {
    if (!o.isMesh && !o.isPoints) return;
    if (o.userData?.caster) return; // the casters are drawn in the shadow pass only (counted below)
    const g = o.geometry;
    if (o.frustumCulled !== false) {
      if (!g.boundingSphere) g.computeBoundingSphere();
      sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (!frustum.intersectsSphere(sphere)) return;
    }
    calls++;
    const count = o.isPoints ? 0 : Math.min(g.index ? g.index.count : g.attributes.position.count, g.drawRange.count);
    const t = Math.floor(count / 3);
    triangles += t;
    if (o.name.startsWith('Grass')) grass += t;
    const part = o.name.startsWith('Forest ') && o.name.includes(':') ? o.name.split(' ')[1].split(':')[0] : o.name.split(' ')[0];
    parts[part] = parts[part] || [0, 0];
    parts[part][0]++;
    parts[part][1] += t;
  });
  // casters: the caster meshes with something to draw (they are shown only for the shadow pass)
  let casterCalls = 0, casterTris = 0;
  forest.group.traverse(o => {
    if (o.isMesh && o.userData?.caster && o.userData.cull.submitted > 0) { casterCalls++; casterTris += o.userData.cull.submitted; }
  });
  return {
    calls: calls + casterCalls, triangles: triangles + casterTris,
    main: { calls, triangles }, casters: { calls: casterCalls, triangles: casterTris }, grass, parts,
  };
}
