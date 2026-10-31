import * as THREE from 'three';
import { cullBatches, cullCasters } from '../../world/forest/batch.js';

/** Scene-local cutaway for the traveling board camera. Native trees are
 * already split into per-plant index ranges, so a foreground cutaway needs
 * neither transparent materials nor an extra draw. Distant scenery stays. */
export function createForestVisibility(forest, camera, lighting) {
  const entries = [];
  forest.group.traverse(mesh => {
    if (mesh.userData.cull) entries.push({ mesh, ranges: mesh.userData.cull.ranges });
  });
  const main = entries.filter(e => !e.mesh.userData.caster).map(e => e.mesh);
  const casters = entries.filter(e => e.mesh.userData.caster).map(e => e.mesh);
  const mainRanges = entries.filter(e => !e.mesh.userData.caster).flatMap(e => e.ranges.map(range => ({ range, kind: e.mesh.userData.kind })));
  const plantKeys = new WeakMap();
  for (const { range } of mainRanges) plantKeys.set(range, `${range.name}:${range.ref.x.toFixed(3)}:${range.ref.z.toFixed(3)}`);
  // Shadow geometry is a slightly inset copy of the coarsest visible model.
  // Match its ranges once, then remove the entire tree consistently in both
  // passes instead of leaving a coarser crown's shadow across the clearing.
  for (const entry of entries.filter(e => e.mesh.userData.caster)) for (const range of entry.ranges) {
    let closest, distance = Infinity;
    for (const candidate of mainRanges) {
      if (candidate.range.name !== range.name || candidate.kind !== entry.mesh.userData.kind) continue;
      const d = candidate.range.sphere.center.distanceToSquared(range.sphere.center);
      if (d < distance) { distance = d; closest = candidate.range; }
    }
    if (closest) plantKeys.set(range, plantKeys.get(closest));
  }
  const previous = new THREE.Vector3(Infinity, 0, 0), previousTarget = new THREE.Vector3(), view = new THREE.Vector3();
  let hidden = 0;
  function update(target) {
    if (camera.position.distanceToSquared(previous) < .0225 && target.distanceToSquared(previousTarget) < .0225) return;
    previous.copy(camera.position); previousTarget.copy(target); camera.updateMatrixWorld(true);
    const focusDepth = -target.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
    hidden = 0;
    const hiddenPlants = new Set();
    for (const { range } of mainRanges) {
        // Keep the small background accents. Only full trees/crowns can form
        // an opaque wall between this camera and the authored play spaces.
        if (!['broadleaf', 'araucaria', 'treeFern', 'cycad', 'bush'].includes(range.name)) continue;
        view.copy(range.sphere.center).applyMatrix4(camera.matrixWorldInverse);
        const depth = -view.z, radius = range.sphere.radius;
        if (depth - radius > focusDepth - 3 || depth + radius < 0) continue;
        const sx = Math.max(.1, depth) * tan * camera.aspect, sy = Math.max(.1, depth) * tan;
        const blocks = Math.abs(view.x) < sx * 1.18 + radius && Math.abs(view.y) < sy * 1.12 + radius;
        if (blocks) hiddenPlants.add(plantKeys.get(range));
    }
    for (const entry of entries) {
      entry.mesh.userData.cull.ranges = entry.ranges.filter(range => {
        const hide = hiddenPlants.has(plantKeys.get(range)); if (hide) hidden++;
        return !hide;
      });
      entry.mesh.userData.cull.signature = -1;
    }
    cullBatches(main, camera);
    cullCasters(casters, lighting.sun.target.position, lighting.focusRadius ?? 15, lighting.direction);
  }
  return { update, getDebug: () => ({ hiddenRanges: hidden }), dispose() { for (const entry of entries) entry.mesh.userData.cull.ranges = entry.ranges; } };
}
