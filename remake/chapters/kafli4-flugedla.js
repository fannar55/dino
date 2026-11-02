// Flugeðla's life at the white snag (chapter 4, spec 4 and 9): on its very top with her wings spread and still, for there is no wind
// (scene 2); her wings stir in each gust Egill makes and she lifts off the top on the big one (scene 3). The circle round the tree
// and her sitting low for Egill come with the scenes that use them (scenes 4 and 5).
//
//   const perched = perch(c, { near: SNAG, heading });   // c: the chapter's state (c.world, c.flugedla); near: the snag's [x, z]
//   perched.top           where her feet are: the top of the snag
//   perched.wingTips()    the ends of her two wings ([left, right], world), as a test reads how spread they are
//   perched.stir(amount)  a gust in her wings: they lift and settle, swinging, over a second and a half (1 a gust's, 2 the big one's)
//   perched.lift(m, s)    she rises `m` metres off the top over `s` seconds, the wind under her wings (and 0 brings her down again)
//   perched.lifted        how far off the top she is now
//   perched.release()     gives her back to her clips (the flight, or a scene that moves her)
//
// Her pose is the model's own (pteranodon-source.json: Tripo's, baked as the bind pose): standing upright on her two feet with both
// wings spread to the sides. No clip holds it (idle folds the wings), so the perch puts the skeleton back in it after the clips every
// frame; her look and her mouth go on over it, so she turns her head to whoever speaks and speaks her lines.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const rad = THREE.MathUtils.degToRad;

// A gust in her wings: each wing turns up about its shoulder by a swing that dies away (degrees at amount 1, swings a second, seconds)
export const STIR = { degrees: 7, rate: 2.2, fade: 0.55, last: 1.6 };

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
  const shoulders = ['LeftUpperArm', 'RightUpperArm'].map(name => her.model.getObjectByName(name));
  const stirs = []; // the gusts in her wings: { amount, age }
  const rise = { from: 0, to: 0, seconds: 1, age: 1, now: 0 }; // her lift off the top
  her.root.visible = true;
  her.root.position.copy(top);
  her.root.quaternion.copy(facing);
  // Each wing lifts about the line across its shoulder (from the shoulder to the tip, crossed with up, turns the tip up): measured
  // once in her own pose, in her own frame.
  her.root.updateMatrixWorld(true);
  for (const skeleton of skeletons) skeleton.pose();
  her.root.updateMatrixWorld(true);
  const axes = shoulders.map((shoulder, i) => {
    const from = shoulder.getWorldPosition(new THREE.Vector3());
    const out = tipBones[i].getWorldPosition(new THREE.Vector3()).sub(from);
    return out.cross(UP).normalize().applyQuaternion(facing.clone().invert()); // in her frame
  });
  const axis = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  her.control(dt => {
    rise.age += dt;
    const k = Math.min(1, rise.age / rise.seconds);
    rise.now = rise.from + (rise.to - rise.from) * k * k * (3 - 2 * k);
    her.root.position.copy(top);
    her.root.position.y += rise.now;
    her.root.quaternion.copy(facing);
  }, dt => {
    for (const skeleton of skeletons) skeleton.pose(); // her own pose, the wings spread, over whatever clip plays
    let swing = 0;
    for (let i = stirs.length - 1; i >= 0; i--) {
      const stir = stirs[i];
      stir.age += dt;
      if (stir.age >= STIR.last) stirs.splice(i, 1);
      else swing += stir.amount * Math.sin(stir.age * STIR.rate * Math.PI * 2) * Math.exp(-stir.age / STIR.fade) * (1 - stir.age / STIR.last);
    }
    if (swing === 0) return;
    her.root.updateMatrixWorld(true);
    shoulders.forEach((shoulder, i) => {
      if (!shoulder) return;
      axis.copy(axes[i]).applyQuaternion(her.root.quaternion);
      shoulder.parent.getWorldQuaternion(parentQ);
      turn.setFromAxisAngle(axis, rad(STIR.degrees) * Math.abs(swing) * (swing > 0 ? 1 : 0.4)); // up more than down
      if (swing < 0) turn.invert();
      shoulder.quaternion.premultiply(parentQ.clone().invert().multiply(turn).multiply(parentQ));
      shoulder.updateMatrixWorld(true);
    });
  });
  return {
    top,
    wingTips() {
      her.root.updateMatrixWorld(true);
      return tipBones.map(bone => bone.getWorldPosition(new THREE.Vector3()));
    },
    stir(amount = 1) {
      stirs.push({ amount, age: 0 });
    },
    lift(metres, seconds = 1) {
      Object.assign(rise, { from: rise.now, to: metres, seconds: Math.max(1e-3, seconds), age: 0 });
    },
    get lifted() { return rise.now; },
    release() {
      her.control(null);
    },
  };
}
