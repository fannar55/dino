import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { holdWithHands } from '../../engine/hand-hold.js';
import { sparkleBurst, needEffects } from './sparkles.js';
import { BERRY, BUNCH, berryGeometry, bunchGeometry } from './berries.js';

// Egill's leaf basket (chapter 2, scene 4: "laufkarfa"): he carries it in both hands, the bunches of berries he picks fly into it,
// and he holds it up as high as his arms go for Þórseðla, whose head comes down to it. A little bowl of big green leaves folded
// round it, their tips standing up round the rim, bound with brown twine, 0.25 m across; the bunches in it are the bushes' own
// (world/props/berries.js), the same size, heaped up over the rim. Held up, a soft warm glow stays round it. Draw calls: the bowl,
// its berries, and the glow while it is up.
//
//   const basket = createBasket(world);
//   basket.hold(egill);                 // it pops into his hands; his hands hold its rim (engine/hand-hold.js)
//   yield berries.pick(name, basket.point); yield basket.add('red');   // a bunch lands in it: basket.count goes up
//   yield basket.raise(egill);          // both hands up, stretched up and out in front of him, the basket held up high
//   basket.lower();  basket.empty(to);  basket.putDown();
//
// His hands reach for points on either side of the rim where the basket is held (in front of his tummy, or up high), each hand
// turned to it, its palm against the rim and its fingers up over it; and the basket is put where his hands are each frame, after
// the hold has moved them, so it never slides through his fingers or hangs off them. Egill's arms are short (0.27 m from shoulder
// to wrist; with his big head he cannot reach over it): held up high, the basket is up and out in front of his face and a little
// to his right, tipped back so the berries show to the camera behind him, as high as his wrists go there.

const SIZE = { rim: 0.12, depth: 0.1 }; // m: the rim's radius and the depth
const LEAVES = { count: 8, light: '#6f9a45', dark: '#4e7a34', inside: '#3d5e2a', twine: '#6b4a2b', tip: 0.022 }; // the leaves round it
// Where his wrists hold it, in his own frame (metres forward, up, half the width between them, how far right of his middle), and
// how far the basket tips forward (back, below 0): carried in front of his tummy; held up as high as he reaches, up and out in front
// of him and a little to his right, so it is seen past his big head from behind his right shoulder, where the camera watches her
// face come down (Task 3's headDown), tipped back toward that camera. The wrists stay within his reach (0.27 m of his shoulders).
const POSES = {
  hold: { wrists: [0.17, 0.555, 0.125, 0], tilt: 0 },
  raise: { wrists: [0.165, 0.84, 0.12, 0.115], tilt: -0.22 },
};
const GRIP_UP = 0.012; // m the rim stands above the middle of his wrists: his hands hold it just under the lip
const FORWARD = 0.035; // m the basket's middle is ahead of his wrists: his hands are at its sides, a little back
// Where the five bunches lie in it, heaped up over its rim (its frame: x forward, z to his right, y up from its foot).
const IN_BASKET = [[0, 0.115, 0], [0.05, 0.1, 0.035], [-0.045, 0.1, 0.04], [0.02, 0.098, -0.055], [-0.02, 0.15, -0.012], [0.03, 0.14, 0.03]];
const GLOW = { size: 0.6, colour: '#ffe7a8' };
// The hand's own frame in Egill's rig (bind pose): its fingers point along FINGERS from the wrist, its palm faces PALM (right hand;
// the left mirrors z). Measured from the skin his Hand bones carry.
const HAND = { fingers: new THREE.Vector3(0.21, -0.86, 0.48).normalize(), palm: new THREE.Vector3(0, -0.48, -0.86) };

const smooth = t => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

/** The leaf bowl, its foot on y = 0: a lathe of its outside, its rim and its inside, each leaf two bands, light and dark. */
function basketGeometry() {
  const { rim, depth } = SIZE;
  const profile = [
    [0, 0], [rim * 0.6, 0], [rim * 0.84, depth * 0.3], [rim * 0.97, depth * 0.78], [rim * 1.05, depth * 0.93],
    [rim, depth], [rim * 0.9, depth * 0.93], [rim * 0.8, depth * 0.36], [rim * 0.56, depth * 0.12], [0, depth * 0.12],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const segments = LEAVES.count * 2;
  const lathe = new THREE.LatheGeometry(profile, segments);
  // the leaves' tips stand up round the rim, between the twine's binding
  const pos = lathe.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < depth * 0.9) continue;
    const phi = Math.atan2(pos.getZ(i), pos.getX(i));
    pos.setY(i, pos.getY(i) + LEAVES.tip * Math.max(0, Math.cos(phi * LEAVES.count)) ** 2);
  }
  lathe.computeVertexNormals();
  const geometry = lathe.toNonIndexed();
  lathe.dispose();
  geometry.deleteAttribute('uv');
  const rows = profile.length - 1;
  const colour = [];
  const C = Object.fromEntries(['light', 'dark', 'inside', 'twine'].map(k => [k, new THREE.Color(LEAVES[k])]));
  for (let t = 0; t < geometry.attributes.position.count / 3; t++) {
    const quad = Math.floor(t / 2);
    const around = Math.floor(quad / rows), row = quad % rows;
    const k = row === 3 ? C.twine : row > 5 ? C.inside : around % 2 ? C.light : C.dark;
    for (let v = 0; v < 3; v++) colour.push(k.r, k.g, k.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** A soft round glow, drawn added to what is behind it, as a quad that faces the camera. */
function glowMesh() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color(GLOW.colour) }, uStrength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: 'uniform vec3 uColour; uniform float uStrength; varying vec2 vUv; void main() { float r = length( vUv - 0.5 ) * 2.0; float a = pow( max( 0.0, 1.0 - r ), 2.2 ) * uStrength; gl_FragColor = vec4( uColour * a, a ); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  material.name = 'basket glow';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GLOW.size, GLOW.size), material);
  mesh.name = 'Basket glow';
  mesh.renderOrder = 11;
  mesh.visible = false;
  return mesh;
}

/**
 * Egill's basket. Returns
 *   group        the basket and its berries, in world.scene (out of sight until it is held)
 *   point        a live point over the middle of its mouth, where a bunch flies to
 *   hold(actor)  it comes into actor's hands (with a little burst of glints), held in front of his tummy
 *   raise(actor, { duration = 0.9 })  he holds it up high in both hands, and it glows; a Handle, done when it is up
 *   lower({ duration = 0.6 })         back to in front of his tummy; a Handle
 *   add(kind = 'red')                 a bunch lands in it with a bounce; a Handle; `count` is how many are in it, `total` all told
 *   empty(to)                         the bunches fly out of it one by one to `to` (a point spec: her mouth); a Handle
 *   putDown()                         on the ground in front of his feet, and his hands let go
 *   count, total, lift, hands, dispose()
 */
export function createBasket(world) {
  needEffects(world, 'createBasket');
  const group = new THREE.Group();
  group.name = 'Basket';
  group.visible = false;
  const geometry = basketGeometry();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  material.name = 'basket';
  const bowl = new THREE.Mesh(geometry, material);
  bowl.name = 'Basket bowl';
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  group.add(bowl);
  const berryShape = berryGeometry();
  const wholeBunch = bunchGeometry();
  const berryMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 });
  berryMaterial.name = 'basket berries';
  const berries = new THREE.InstancedMesh(berryShape, berryMaterial, IN_BASKET.length * BUNCH.length);
  berries.name = 'Basket berries';
  berries.count = 0;
  berries.castShadow = false;
  group.add(berries);
  const glow = glowMesh(); // in the basket's group: drawn when it is (the chapter's warm-up compiles it with the basket)
  group.add(glow);
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
    const at = i => a[i] + (b[i] - a[i]) * k;
    local.set(at(0), at(1), at(2) * (side === 'left' ? -1 : 1) + at(3));
    actor.root.updateMatrixWorld(true);
    return out.copy(local).applyMatrix4(actor.root.matrixWorld);
  }

  // His hands turned to the rim: each frame, from the turn his clip gives them, toward palm on the rim and fingers up over it, as
  // far as the hold holds (its weight). The clip's own turn goes back to a hand the mixer has left as this set it (hand-hold.js's
  // way), so letting go ends on the clip's pose.
  const turns = { left: { own: new THREE.Quaternion(), set: null }, right: { own: new THREE.Quaternion(), set: null } };
  const fingersTo = new THREE.Vector3(), palmTo = new THREE.Vector3(), handTurn = new THREE.Quaternion(), parentTurn = new THREE.Quaternion();
  const fromBasis = new THREE.Matrix4(), toBasis = new THREE.Matrix4(), third = new THREE.Vector3(), third2 = new THREE.Vector3();
  function turnHands(weight) {
    for (const side of ['left', 'right']) {
      const bone = actor.model.getObjectByName(side === 'left' ? 'LeftHand' : 'RightHand');
      const t = turns[side];
      if (t.set && bone.quaternion.equals(t.set)) bone.quaternion.copy(t.own);
      t.set = null;
      if (weight <= 0) continue;
      t.own.copy(bone.quaternion);
      const mirror = side === 'left' ? -1 : 1;
      const fingers = HAND.fingers.clone().setZ(HAND.fingers.z * mirror);
      const palm = HAND.palm.clone().setZ(HAND.palm.z * mirror);
      palm.addScaledVector(fingers, -palm.dot(fingers)).normalize();
      // on its side of the rim: the palm toward the basket's middle, the fingers up and a little in, over the rim
      palmTo.copy(across).multiplyScalar(-mirror);
      fingersTo.set(0, 1, 0).addScaledVector(palmTo, 0.45).normalize();
      palmTo.addScaledVector(fingersTo, -palmTo.dot(fingersTo)).normalize();
      fromBasis.makeBasis(fingers, palm, third.crossVectors(fingers, palm));
      toBasis.makeBasis(fingersTo, palmTo, third2.crossVectors(fingersTo, palmTo));
      handTurn.setFromRotationMatrix(toBasis.multiply(fromBasis.transpose()));
      bone.parent.getWorldQuaternion(parentTurn);
      const target = parentTurn.invert().multiply(handTurn);
      bone.quaternion.slerp(target, smooth(weight));
      bone.updateMatrixWorld(true);
      t.set = bone.quaternion.clone();
    }
  }

  const mid = new THREE.Vector3(), across = new THREE.Vector3(), ahead = new THREE.Vector3(), up = new THREE.Vector3();
  const basis = new THREE.Matrix4(), turn = new THREE.Quaternion(), tilt = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1), qb = new THREE.Quaternion();
  const bunchAt = new THREE.Vector3(), bunchMiddle = new THREE.Vector3();
  /** The basket where his hands are now: between his wrists, a little ahead, its rim just above them, level across them. */
  function place() {
    const leftHand = actor.model.getObjectByName('LeftHand'), rightHand = actor.model.getObjectByName('RightHand');
    actor.root.updateMatrixWorld(true);
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
    tilt.setFromAxisAngle(across, -(POSES.hold.tilt + (POSES.raise.tilt - POSES.hold.tilt) * smooth(lift)));
    group.quaternion.copy(tilt).multiply(turn);
    group.position.copy(mid).addScaledVector(ahead, FORWARD).addScaledVector(up, GRIP_UP - SIZE.depth);
    group.updateMatrixWorld(true);
    point.set(0, SIZE.depth + 0.06, 0).applyMatrix4(group.matrixWorld);
  }

  function poseBerries() {
    berries.count = added.length * BUNCH.length;
    added.forEach(({ at }, i) => {
      const k = Math.min(1, (now - at) / 0.3);
      const bounce = k < 1 ? 0.05 * Math.sin(Math.PI * k) * (1 - k) : 0;
      const [x, y, z] = IN_BASKET[i % IN_BASKET.length];
      qb.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i * 1.7);
      BUNCH.forEach((offset, b) => {
        bunchAt.fromArray(offset).applyQuaternion(qb).add(bunchMiddle.set(x, y + bounce, z));
        matrix.compose(bunchAt, qb, unit.setScalar(1));
        berries.setMatrixAt(i * BUNCH.length + b, matrix);
      });
    });
    berries.instanceMatrix.needsUpdate = true;
  }

  let placing = null; // the effect that puts the basket in his hands: added after the hold's own, so it sees his hands as held
  function hold(who) {
    actor = who;
    hands?.release(0);
    hands = holdWithHands(world, who, { left: out => wristGoal('left', out), right: out => wristGoal('right', out) }).grip(0.45);
    if (placing) placing.over = true;
    const effect = {
      over: false,
      update() {
        if (this.over || disposed) return false;
        place();
        turnHands(hands?.weight ?? 0);
        return true;
      },
    };
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
    turnHands(0); // the hands' own turn back
    hands?.release(0.4);
    hands = null;
    lift = 0;
    actor.root.updateMatrixWorld(true);
    const at = new THREE.Vector3(0.38, 0, 0.12).applyMatrix4(actor.root.matrixWorld);
    at.y = world.heightAt?.(at.x, at.z) ?? actor.root.position.y;
    group.quaternion.copy(actor.root.quaternion);
    group.position.copy(at);
    group.updateMatrixWorld(true);
    point.set(0, SIZE.depth + 0.06, 0).applyMatrix4(group.matrixWorld);
  }

  function lerpTo(to, duration, label) {
    move?.handle.finish();
    const handle = new Handle(label, () => { lift = to; move = null; });
    move = { from: lift, to, start: now, duration: Math.max(0.001, duration), handle };
    return handle;
  }
  function raise(who = actor, { duration = 0.9 } = {}) {
    if (who !== actor) hold(who);
    const up1 = lerpTo(1, duration, 'basket up');
    // and as it gets there, the berries in it glitter: held up for her
    const glitter = new Handle('basket glitters');
    live.add(glitter);
    const at = now + duration * 0.8;
    world.effects.add({ update() { if (glitter.done || disposed) return false; if (now < at) return true; live.add(sparkleBurst(world, point.clone(), { count: 22, duration: 1.3, size: 0.2, spread: 0.45, seed: 'basket held up' })); glitter.finish(); return false; } });
    return up1;
  }
  function lower({ duration = 0.6 } = {}) { return lerpTo(0, duration, 'basket down'); }

  function add(kind = 'red') {
    const handle = new Handle('a bunch in the basket');
    added.push({ at: now, kind });
    total++;
    const i = added.length - 1;
    const tint = new THREE.Color();
    BUNCH.forEach((_, b) => berries.setColorAt(i * BUNCH.length + b, tint.set(BERRY[kind] ?? BERRY.red).offsetHSL(0, 0, (b % 3 - 1) * 0.04)));
    berries.instanceColor.needsUpdate = true;
    poseBerries();
    added.at(-1).handle = handle;
    return handle;
  }

  // Out of the basket: each bunch flies to `to` (a point spec, followed: Þórseðla's mouth), one after another.
  const leaving = []; // { out: [{ mesh, from, start, seconds }], to, handle }
  const there = new THREE.Vector3();
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
  function empty(to, { every = 0.2, seconds = 0.45 } = {}) {
    const handle = new Handle('the basket emptied');
    const many = added.length;
    if (!many) return handle.finish();
    group.updateMatrixWorld(true);
    const out = added.splice(0, many).map((a, i) => {
      const [x, y, z] = IN_BASKET[i % IN_BASKET.length];
      const bunch = new THREE.Mesh(wholeBunch, flyMaterial(a.kind));
      bunch.name = 'Bunch to her mouth';
      bunch.position.set(x, y, z).applyMatrix4(group.matrixWorld);
      bunch.visible = false;
      world.scene.add(bunch);
      if (a.handle && !a.handle.done) a.handle.finish();
      return { mesh: bunch, from: bunch.position.clone(), start: now + i * every, seconds };
    });
    leaving.push({ out, to, handle });
    poseBerries();
    return handle;
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

  // the glow round it while it is held up: on the camera's side of it, facing the camera, breathing a little
  const camQ = new THREE.Quaternion(), groupQ = new THREE.Quaternion();
  function poseGlow() {
    const k = group.visible ? smooth((lift - 0.55) / 0.45) : 0;
    glow.visible = k > 0.01;
    if (!glow.visible) return;
    glow.material.uniforms.uStrength.value = k * (0.75 + 0.2 * Math.sin(now * 3.1));
    const camera = world.camera;
    glow.position.copy(point);
    if (camera) {
      camera.getWorldQuaternion(camQ);
      glow.position.lerp(camera.position, 0.02);
    }
    // where it is in the world, put in the group's frame
    group.updateMatrixWorld(true);
    group.worldToLocal(glow.position);
    glow.quaternion.copy(group.getWorldQuaternion(groupQ).invert());
    if (camera) glow.quaternion.multiply(camQ);
  }

  world.effects.add({
    update() {
      if (disposed) return false;
      now = world.clock?.time ?? now;
      if (move) {
        const u = (now - move.start) / move.duration;
        lift = move.from + (move.to - move.from) * Math.min(1, u);
        if (u >= 1) { const { handle } = move; move = null; handle.finish(); }
      }
      if (leaving.length) flyOut();
      if (added.length) poseBerries();
      poseGlow();
      for (const a of added) if (a.handle && !a.handle.done && now - a.at >= 0.3) a.handle.finish();
      for (const handle of live) if (handle.done) live.delete(handle);
      return true;
    },
  });

  return {
    group, point, hold, raise, lower, add, empty, putDown,
    get count() { return added.length; },
    /** How many bunches have gone into it, all told (eaten ones too). */
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
      if (actor) turnHands(0);
      hands?.release(0);
      group.removeFromParent();
      geometry.dispose(); material.dispose();
      berryShape.dispose(); wholeBunch.dispose(); berryMaterial.dispose(); berries.dispose();
      glow.geometry.dispose(); glow.material.dispose();
    },
  };
}
