// Flugeðla's life at the white snag (chapter 4, spec 4 and 9): on its very top with her wings spread and still, for there is no wind
// (scene 2). The circle round the tree and her sitting low for Egill come with the scenes that use them (scenes 4 and 5).
//
//   const perched = perch(c, { near: SNAG, heading });   // c: the chapter's state (c.world, c.flugedla); near: the snag's [x, z]
//   perched.top           where her feet are: the top of the snag
//   perched.wingTips()    the ends of her two wings ([left, right], world), as a test reads how spread they are
//   perched.release()     gives her back to her clips (the flight, or a scene that moves her)
//
// Her pose is the model's own (pteranodon-source.json: Tripo's, baked as the bind pose): standing upright on her two feet with both
// wings spread to the sides. No clip holds it (idle folds the wings), so the perch puts the skeleton back in it after the clips every
// frame; her look and her mouth go on over it, so she turns her head to whoever speaks and speaks her lines.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const rad = THREE.MathUtils.degToRad;

/**
 * The top of the dead snag that stands at `near` ([x, z], within 1.5 m) in the place in view, as its forest grew it
 * (world/forest/forest.js: info.placementList): its broken top, which leans aside of its foot.
 */
export function snagTop(world, [x, z]) {
  const snags = (world.forest?.info?.placementList ?? []).filter(p => p.name === 'deadSnag');
  const snag = snags.find(p => Math.hypot(p.x - x, p.z - z) < 1.5);
  if (!snag) throw new Error(`No dead snag at ${x}, ${z} in ${world.location ?? 'this place'}`);
  const [tx, tz] = snag.tip ?? [snag.x, snag.z];
  return new THREE.Vector3(tx, snag.y + snag.top, tz);
}

/**
 * Flugeðla on the top of the snag at `near`, facing `heading` (degrees: 0 faces +X, 90 +Z), her wings spread and still. Returns
 * { top, wingTips(), release() }.
 */
export function perch(c, { near, heading }) {
  const her = c.flugedla.raw;
  const top = snagTop(c.world, near);
  const facing = new THREE.Quaternion().setFromAxisAngle(UP, -rad(heading));
  const skeletons = [];
  her.model.traverse(o => { if (o.isSkinnedMesh && !skeletons.includes(o.skeleton)) skeletons.push(o.skeleton); });
  const tipBones = ['LeftFinger3', 'RightFinger3'].map(name => her.model.getObjectByName(name));
  her.root.visible = true;
  her.root.position.copy(top);
  her.root.quaternion.copy(facing);
  her.control(() => {
    her.root.position.copy(top);
    her.root.quaternion.copy(facing);
  }, () => {
    for (const skeleton of skeletons) skeleton.pose(); // her own pose, the wings spread, over whatever clip plays
  });
  return {
    top,
    wingTips() {
      her.root.updateMatrixWorld(true);
      return tipBones.map(bone => bone.getWorldPosition(new THREE.Vector3()));
    },
    release() {
      her.control(null);
    },
  };
}
