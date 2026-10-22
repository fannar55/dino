import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { holdWithHands } from '../../engine/hand-hold.js';
import { sparkleBurst, needEffects } from './sparkles.js';

// Egill's little woven basket (chapter 2, scene 4): he carries it in both hands, the berries he picks fly into it, and he holds
// it up as high as his arms go for Þórseðla, whose head comes down to it. A bowl of warm straw woven in a checker, with a darker
// rim, 0.19 m across; the berries in it are the bushes' berries (world/props/berries.js), smaller. Two draw calls: the basket and
// its berries.
//
//   const basket = createBasket(world);
//   basket.hold(egill);                 // it pops into his hands; his hands hold its rim (engine/hand-hold.js)
//   yield berries.pick(name, basket.point); yield basket.add('red');   // a berry lands in it: basket.count goes up
//   yield basket.raise(egill);          // both hands up, stretched up and out in front of him, the basket held up high
//   basket.lower();
//
// His hands reach for points on either side of the rim where the basket is held (in front of his tummy, or up high), and the
// basket is put where his hands are each frame, after the hold has moved them, so it never slides through his fingers or hangs
// off them. Egill's arms are short (0.27 m from shoulder to wrist; with his big head he cannot reach over it): held up high, the
// basket is up and out in front of his face, his arms nearly straight, as high as his wrists go there.

const SIZE = { rim: 0.095, depth: 0.095 }; // m: the rim's radius and the depth
const STRAW = { light: '#dcb56c', dark: '#b68a48', rim: '#8a6233', inside: '#7a5a34' };
// Where his wrists hold it, in his own frame (metres forward, up, to his right), and how the basket hangs from them: carried in
// front of his tummy, and held up high out in front of his face. The wrists stay within his reach (0.26 m of his shoulders).
const POSES = {
  hold: { wrists: [0.17, 0.555, 0.105], tilt: 0 },
  raise: { wrists: [0.19, 0.85, 0.095], tilt: 0.25 },
};
const GRIP_UP = 0.012; // m the rim stands above the middle of his wrists: his hands hold it just under the lip
const FORWARD = 0.035; // m the basket's middle is ahead of his wrists: his hands are at its sides, a little back
const BERRY = { radius: 0.03, red: '#d4343c', blue: '#4061c2' };
const IN_BASKET = [[0, 0.03, 0], [0.034, 0.028, 0.022], [-0.032, 0.03, 0.02], [0.012, 0.03, -0.036], [-0.014, 0.055, -0.006], [0.02, 0.056, 0.012]];

const smooth = t => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

/** The woven bowl, its foot on y = 0: a lathe of its outside, its rim and its inside, coloured a weave at a time (288 triangles). */
function basketGeometry() {
  const { rim, depth } = SIZE;
  const profile = [
    [0, 0], [rim * 0.62, 0], [rim * 0.84, depth * 0.3], [rim * 0.96, depth * 0.78], [rim * 1.04, depth * 0.92],
    [rim, depth], [rim * 0.9, depth * 0.92], [rim * 0.8, depth * 0.36], [rim * 0.56, depth * 0.12], [0, depth * 0.12],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const segments = 16;
  const lathe = new THREE.LatheGeometry(profile, segments);
  lathe.computeVertexNormals();
  const geometry = lathe.toNonIndexed();
  lathe.dispose();
  geometry.deleteAttribute('uv');
  const rows = profile.length - 1;
  const colour = [];
  const C = Object.fromEntries(Object.entries(STRAW).map(([k, v]) => [k, new THREE.Color(v)]));
  for (let t = 0; t < geometry.attributes.position.count / 3; t++) {
    const quad = Math.floor(t / 2);
    const around = Math.floor(quad / rows), row = quad % rows;
    const k = row >= 4 && row <= 5 ? C.rim : row > 5 ? C.inside : (around + row) % 2 ? C.light : C.dark;
    for (let v = 0; v < 3; v++) colour.push(k.r, k.g, k.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Egill's basket. Returns
 *   group        the basket and its berries, in world.scene (out of sight until it is held)
 *   point        a live point over the middle of its mouth, where a berry flies to
 *   hold(actor)  it comes into actor's hands (with a little burst of glints), held in front of his tummy
 *   raise(actor, { duration = 0.9 })  he holds it up high in both hands; a Handle, done when it is up
 *   lower({ duration = 0.6 })         back to in front of his tummy; a Handle
 *   add(kind = 'red')                 a berry lands in it with a bounce; a Handle; `count` is how many are in it
 *   empty(to)                         the berries fly out of it one by one to `to` (a point spec: her mouth); a Handle
 *   putDown()                         on the ground in front of his feet, and his hands let go
 *   count, dispose()
 */
export function createBasket(world) {
  needEffects(world, 'createBasket');
  const group = new THREE.Group();
  group.name = 'Basket';
  group.visible = false;
  const geometry = basketGeometry();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  material.name = 'basket';
  const bowl = new THREE.Mesh(geometry, material);
  bowl.name = 'Basket bowl';
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  group.add(bowl);
  const berryGeometry = new THREE.SphereGeometry(BERRY.radius, 8, 5);
  const berryMaterial = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 });
  berryMaterial.name = 'basket berries';
  const berries = new THREE.InstancedMesh(berryGeometry, berryMaterial, IN_BASKET.length);
  berries.name = 'Basket berries';
  berries.count = 0;
  berries.castShadow = false;
  group.add(berries);
  world.scene.add(group);

  const point = new THREE.Vector3();
  let actor = null;
  let hands = null;
  let lift = 0; // 0 carried, 1 held up
  let move = null; // { from, to, start, duration, handle }
  let now = 0;
  let disposed = false;
  const added = []; // { at, kind }
  let total = 0;
  const live = new Set();

  const wrists = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  const local = new THREE.Vector3();
  /** Where a wrist goes now: the pose's, between carried and held up, in the actor's frame. */
  function wristGoal(side, out) {
    const a = POSES.hold.wrists, b = POSES.raise.wrists, k = smooth(lift);
    local.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (a[2] + (b[2] - a[2]) * k) * (side === 'left' ? -1 : 1));
    actor.root.updateMatrixWorld(true);
    return out.copy(local).applyMatrix4(actor.root.matrixWorld);
  }

  const mid = new THREE.Vector3(), across = new THREE.Vector3(), ahead = new THREE.Vector3(), up = new THREE.Vector3();
  const basis = new THREE.Matrix4(), turn = new THREE.Quaternion(), tilt = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1), q = new THREE.Quaternion();
  /** The basket where his hands are now: between his wrists, a little ahead, its rim just above them, level across them. */
  function place() {
    const leftHand = actor.model.getObjectByName('LeftHand'), rightHand = actor.model.getObjectByName('RightHand');
    leftHand.getWorldPosition(wrists.left);
    rightHand.getWorldPosition(wrists.right);
    mid.addVectors(wrists.left, wrists.right).multiplyScalar(0.5);
    across.subVectors(wrists.right, wrists.left).setY(0);
    if (across.lengthSq() < 1e-8) across.set(0, 0, 1);
    across.normalize();
    ahead.set(across.z, 0, -across.x); // his right is +z when he faces +x: forward is right turned back a quarter
    up.set(0, 1, 0);
    basis.makeBasis(ahead, up, across);
    turn.setFromRotationMatrix(basis);
    tilt.setFromAxisAngle(across, -(POSES.hold.tilt + (POSES.raise.tilt - POSES.hold.tilt) * smooth(lift))); // tipped toward her a little, held up
    group.quaternion.copy(tilt).multiply(turn);
    group.position.copy(mid).addScaledVector(ahead, FORWARD).addScaledVector(up, GRIP_UP - SIZE.depth);
    group.updateMatrixWorld(true);
    point.set(0, SIZE.depth + 0.04, 0).applyMatrix4(group.matrixWorld);
  }

  function poseBerries() {
    berries.count = added.length;
    added.forEach(({ at }, i) => {
      const k = Math.min(1, (now - at) / 0.3);
      const bounce = k < 1 ? 0.05 * Math.sin(Math.PI * k) * (1 - k) : 0;
      const [x, y, z] = IN_BASKET[i % IN_BASKET.length];
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i * 1.7);
      matrix.compose(local.set(x, y + bounce, z), q, unit.setScalar(0.4 + 0.6 * Math.min(1, k * 2)));
      berries.setMatrixAt(i, matrix);
    });
    berries.instanceMatrix.needsUpdate = true;
  }

  let placing = null; // the effect that puts the basket in his hands: added after the hold's own, so it sees his hands as held
  function hold(who) {
    actor = who;
    hands?.release(0);
    hands = holdWithHands(world, who, { left: out => wristGoal('left', out), right: out => wristGoal('right', out) }).grip(0.45);
    if (placing) placing.over = true;
    const effect = { over: false, update() { if (this.over || disposed) return false; place(); return true; } };
    placing = effect;
    world.effects.add(effect);
    group.visible = true;
    place();
    live.add(sparkleBurst(world, point.clone(), { count: 14, duration: 0.9, size: 0.16, spread: 0.35, seed: 'basket appears' }));
    return group;
  }

  /** He puts it down: on the ground just in front of his feet, his hands his own again. */
  function putDown() {
    if (!actor) return;
    if (placing) placing.over = true;
    placing = null;
    hands?.release(0.4);
    hands = null;
    actor.root.updateMatrixWorld(true);
    const at = new THREE.Vector3(0.38, 0, 0.12).applyMatrix4(actor.root.matrixWorld);
    at.y = world.heightAt?.(at.x, at.z) ?? actor.root.position.y;
    group.quaternion.copy(actor.root.quaternion);
    group.position.copy(at);
    group.updateMatrixWorld(true);
    point.set(0, SIZE.depth + 0.04, 0).applyMatrix4(group.matrixWorld);
  }

  function lerpTo(to, duration, label) {
    move?.handle.finish();
    const handle = new Handle(label, () => { lift = to; move = null; });
    move = { from: lift, to, start: now, duration: Math.max(0.001, duration), handle };
    return handle;
  }
  function raise(who = actor, { duration = 0.9 } = {}) {
    if (who !== actor) hold(who);
    return lerpTo(1, duration, 'basket up');
  }
  function lower({ duration = 0.6 } = {}) { return lerpTo(0, duration, 'basket down'); }

  function add(kind = 'red') {
    const handle = new Handle('a berry in the basket');
    added.push({ at: now, kind });
    total++;
    berries.setColorAt(added.length - 1, new THREE.Color(BERRY[kind] ?? BERRY.red));
    berries.instanceColor.needsUpdate = true;
    poseBerries();
    added.at(-1).handle = handle;
    return handle;
  }

  // Out of the basket: each berry flies to `to` (a point spec, followed: Þórseðla's mouth), one after another.
  const leaving = []; // { mesh, from, start, handle }
  const there = new THREE.Vector3();
  function empty(to, { every = 0.2, seconds = 0.45 } = {}) {
    const handle = new Handle('the basket emptied');
    const many = added.length;
    if (!many) return handle.finish();
    group.updateMatrixWorld(true);
    const out = added.splice(0, many).map((a, i) => {
      const [x, y, z] = IN_BASKET[i % IN_BASKET.length];
      const mesh = new THREE.Mesh(berryGeometry, flyMaterial(a.kind));
      mesh.name = 'Berry to her mouth';
      mesh.position.set(x, y, z).applyMatrix4(group.matrixWorld);
      mesh.visible = false;
      world.scene.add(mesh);
      if (a.handle && !a.handle.done) a.handle.finish();
      return { mesh, from: mesh.position.clone(), start: now + i * every, seconds };
    });
    leaving.push({ out, to, handle });
    poseBerries();
    return handle;
  }
  const flyMaterials = new Map();
  function flyMaterial(kind) {
    if (!flyMaterials.has(kind)) {
      const m = berryMaterial.clone();
      m.color = new THREE.Color(BERRY[kind] ?? BERRY.red);
      m.name = `basket berry ${kind} leaving`;
      flyMaterials.set(kind, m);
    }
    return flyMaterials.get(kind);
  }
  function flyOut() {
    for (const set of [...leaving]) {
      const end = world.resolvePoint ? world.resolvePoint(set.to, there) : there.copy(set.to);
      let left = 0;
      for (const b of set.out) {
        const u = (now - b.start) / b.seconds;
        if (u < 0) { left++; continue; }
        if (u >= 1) { if (b.mesh.parent) b.mesh.removeFromParent(); continue; }
        left++;
        b.mesh.visible = true;
        b.mesh.position.lerpVectors(b.from, end, smooth(u));
        b.mesh.position.y += 0.15 * Math.sin(Math.PI * u);
        b.mesh.scale.setScalar(1 - 0.5 * u);
      }
      if (!left) {
        leaving.splice(leaving.indexOf(set), 1);
        set.handle.finish();
      }
    }
  }

  world.effects.add({
    update() {
      if (disposed) return false;
      now = world.clock?.time ?? now;
      if (leaving.length) flyOut();
      if (move) {
        const u = (now - move.start) / move.duration;
        lift = move.from + (move.to - move.from) * Math.min(1, u);
        if (u >= 1) { const { handle } = move; move = null; handle.finish(); }
      }
      if (added.length) poseBerries();
      for (const a of added) if (a.handle && !a.handle.done && now - a.at >= 0.3) a.handle.finish();
      for (const handle of live) if (handle.done) live.delete(handle);
      return true;
    },
  });

  return {
    group, point, hold, raise, lower, add, empty, putDown,
    get count() { return added.length; },
    /** How many berries have gone into it, all told (eaten ones too). */
    get total() { return total; },
    get lift() { return lift; },
    get hands() { return hands; },
    dispose() {
      if (disposed) return;
      disposed = true;
      move?.handle.finish();
      for (const a of added) if (a.handle && !a.handle.done) a.handle.finish();
      for (const handle of live) if (!handle.done) handle.cancel();
      for (const set of leaving) { for (const b of set.out) b.mesh.removeFromParent(); set.handle.finish(); }
      for (const m of flyMaterials.values()) m.dispose();
      hands?.release(0);
      group.removeFromParent();
      geometry.dispose(); material.dispose();
      berryGeometry.dispose(); berryMaterial.dispose(); berries.dispose();
    },
  };
}
