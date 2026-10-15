import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor } from '../engine/actor.js';
import { BLINK, MEET, blinkShape, buildLidGeometry, createBlink, eyesOf } from '../engine/eyelids.js';
import { CHARACTERS, emptyWorld, loadCharacter, readGlb, skinnedMeshOf } from './characters.mjs';

// The eyelids (engine/eyelids.js) over the eyes the face pass (remake/tools/bake/face.js) found in
// each character's colour map, and the blink that drives them.

const NAMES = Object.keys(CHARACTERS);
const BLINK_TIME = BLINK.close + BLINK.hold + BLINK.open;

test('every character carries two eyes on its head, left eye first', async () => {
  for (const name of NAMES) {
    const node = readGlb(name).json.nodes.find(n => n.skin !== undefined);
    const eyes = node.extras?.face?.eyes;
    assert.equal(eyes?.length, 2, `${name}: ${JSON.stringify(node.extras)}`);
    const gltf = await loadCharacter(name);
    gltf.scene.updateMatrixWorld(true);
    const mesh = skinnedMeshOf(gltf.scene);
    assert.deepEqual(mesh.userData.face.eyes, eyes, `${name}: the loader hands the eyes to the mesh`);
    const head = mesh.skeleton.bones.findIndex(b => b.name === 'Head');
    const world = eyes.map(e => new THREE.Vector3(...e.centre).applyMatrix4(mesh.matrixWorld));
    assert.ok(world[0].z < world[1].z, `${name}: the left eye (-Z) comes first`);
    for (const eye of eyes) {
      const [r, d, n] = [eye.right, eye.down, eye.normal].map(a => new THREE.Vector3(...a));
      for (const v of [r, d, n]) assert.ok(Math.abs(v.length() - 1) < 1e-3, `${name}: a frame vector is not a unit vector`);
      assert.ok(Math.abs(r.dot(d)) < 1e-3 && Math.abs(r.dot(n)) < 1e-3 && Math.abs(d.dot(n)) < 1e-3, `${name}: the frame is not square`);
      assert.ok(d.y < -0.85, `${name}: down points down (${eye.down})`);
      for (const size of [eye.halfWidth, eye.top, eye.bottom]) assert.ok(size > 0, `${name}: outline ${size}`);
      for (const colour of [eye.lid, eye.under, eye.lash]) assert.match(colour, /^#[0-9a-f]{6}$/);
      // The skin under the eye's centre belongs to the head alone.
      const position = mesh.geometry.attributes.position;
      const centre = new THREE.Vector3(...eye.centre);
      let nearest = 0, best = Infinity;
      for (let i = 0; i < position.count; i++) {
        const dist = centre.distanceToSquared(new THREE.Vector3().fromBufferAttribute(position, i));
        if (dist < best) { best = dist; nearest = i; }
      }
      const { skinIndex, skinWeight } = mesh.geometry.attributes;
      let w = 0;
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(nearest, k) === head) w += skinWeight.getComponent(nearest, k);
      assert.ok(w > 0.95, `${name}: the eye's skin follows the Head bone (${w.toFixed(3)})`);
    }
  }
});

test('the eyes are where a face has them: in front, side by side, the size of an eye', async () => {
  // Bind-pose world positions in metres at the characters' real sizes.
  const expect = {
    mosi: { height: [2.4, 2.9], apart: [0.6, 1.2], width: [0.15, 0.45] },
    egill: { height: [0.88, 0.95], apart: [0.07, 0.11], width: [0.03, 0.08] },
    gramedla: { height: [4.4, 4.9], apart: [0.9, 1.3], width: [0.3, 0.75] },
  };
  for (const name of NAMES) {
    const gltf = await loadCharacter(name);
    gltf.scene.updateMatrixWorld(true);
    const mesh = skinnedMeshOf(gltf.scene);
    const scale = mesh.matrixWorld.getMaxScaleOnAxis();
    const eyes = mesh.userData.face.eyes;
    const world = eyes.map(e => new THREE.Vector3(...e.centre).applyMatrix4(mesh.matrixWorld));
    const head = mesh.skeleton.bones.find(b => b.name === 'Head').getWorldPosition(new THREE.Vector3());
    const e = expect[name];
    for (const [k, p] of world.entries()) {
      assert.ok(p.y > e.height[0] && p.y < e.height[1], `${name} eye ${k} at height ${p.y.toFixed(3)}`);
      assert.ok(p.x > head.x, `${name} eye ${k} is behind the head's pivot`);
      const width = 2 * eyes[k].halfWidth * scale;
      assert.ok(width > e.width[0] && width < e.width[1], `${name} eye ${k} is ${width.toFixed(3)} m wide`);
    }
    const apart = world[0].distanceTo(world[1]);
    assert.ok(apart > e.apart[0] && apart < e.apart[1], `${name}: eyes ${apart.toFixed(3)} m apart`);
    assert.ok(Math.abs(world[0].y - world[1].y) < 0.25 * apart, `${name}: the eyes are not level`);
  }
});

// Whether (u, v) lies in the triangle (a, b, c) of eye-frame points.
function inTriangle(u, v, a, b, c) {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-14) return false;
  const l1 = ((b[1] - c[1]) * (u - c[0]) + (c[0] - b[0]) * (v - c[1])) / d;
  const l2 = ((c[1] - a[1]) * (u - c[0]) + (a[0] - c[0]) * (v - c[1])) / d;
  return l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6;
}

test('the lid shells cover each eye\'s whole outline, so a shut eye hides the painted one', async () => {
  for (const name of NAMES) {
    const gltf = await loadCharacter(name);
    const mesh = skinnedMeshOf(gltf.scene);
    const eyes = mesh.userData.face.eyes;
    const lids = buildLidGeometry(mesh.geometry, eyes);
    const lid = lids.attributes.lid;
    const index = lids.index.array;
    assert.ok(index.length / 3 < 2000, `${name}: ${index.length / 3} triangles of lids`);
    eyes.forEach((eye, k) => {
      const tris = [];
      for (let t = 0; t < index.length; t += 3) {
        if (lid.getZ(index[t]) !== k) continue;
        tris.push([0, 1, 2].map(j => [lid.getX(index[t + j]), lid.getY(index[t + j])]));
      }
      let missed = 0, tried = 0;
      for (let i = -10; i <= 10; i++) {
        for (let j = -10; j <= 10; j++) {
          const x = i / 10, y = j / 10;
          if (x * x + y * y > 0.999) continue;
          const u = x * eye.halfWidth, v = y * (y < 0 ? eye.top : eye.bottom);
          tried++;
          if (!tris.some(([a, b, c]) => inTriangle(u, v, a, b, c))) missed++;
        }
      }
      assert.equal(missed, 0, `${name} eye ${k}: ${missed} of ${tried} points of the outline are not under a lid`);
    });
    // The shells are skinned like the skin they were copied from: the head carries them.
    const head = mesh.skeleton.bones.findIndex(b => b.name === 'Head');
    const { skinIndex, skinWeight } = lids.attributes;
    let headWeight = 0;
    for (let i = 0; i < skinIndex.count; i++) for (let j = 0; j < 4; j++) if (skinIndex.getComponent(i, j) === head) headWeight += skinWeight.getComponent(i, j);
    assert.ok(headWeight / skinIndex.count > 0.95, `${name}: the head carries ${(100 * headWeight / skinIndex.count).toFixed(1)} % of the lids`);
  }
});

test('a blink closes quickly, holds and opens', () => {
  assert.equal(blinkShape(0), 0);
  assert.equal(blinkShape(BLINK.close + BLINK.hold / 2), 1);
  assert.equal(blinkShape(BLINK_TIME), 0);
  let last = 0;
  for (let t = 0; t <= BLINK.close; t += 0.005) { assert.ok(blinkShape(t) >= last - 1e-9); last = blinkShape(t); }
  for (let t = BLINK.close + BLINK.hold; t <= BLINK_TIME; t += 0.005) { assert.ok(blinkShape(t) <= last + 1e-9); last = blinkShape(t); }
  assert.ok(BLINK_TIME > 0.15 && BLINK_TIME < 0.35, `a blink takes ${BLINK_TIME} s`);
  assert.ok(MEET > 0.5 && MEET < 0.95);
});

// The starts of every blink over `seconds` of 30 fps frames.
function blinkStarts(blink, seconds, step = 1 / 30) {
  const starts = [];
  let t = 0;
  let was = false;
  for (let i = 0; i < seconds / step; i++) {
    blink.update(step);
    t += step;
    if (blink.blinking && !was) starts.push(t);
    was = blink.blinking;
  }
  return starts;
}

test('blinks come every 2 to 6 seconds, now and then two in a row', () => {
  for (const seed of ['mosi', 'egill', 'gramedla', 'kambedla']) {
    const starts = blinkStarts(createBlink({ seed }), 600);
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    const doubles = gaps.filter(g => g < 1);
    const singles = gaps.filter(g => g >= 1);
    assert.ok(starts[0] > 0.9 && starts[0] < 4.1, `${seed}: first blink at ${starts[0].toFixed(2)} s`);
    assert.ok(Math.min(...singles) >= 2 - 1e-6 && Math.max(...singles) <= 6 + 1 / 30, `${seed}: gaps ${Math.min(...singles).toFixed(2)} to ${Math.max(...singles).toFixed(2)} s`);
    for (const g of doubles) assert.ok(g > BLINK_TIME && g < BLINK_TIME + 0.2, `${seed}: a double blink ${g.toFixed(2)} s apart`);
    const share = doubles.length / singles.length;
    assert.ok(share > 0.08 && share < 0.35, `${seed}: ${doubles.length} double blinks in ${singles.length}`);
  }
});

test('the same seed blinks the same, another seed differently', () => {
  const a = blinkStarts(createBlink({ seed: 'mosi' }), 60);
  const b = blinkStarts(createBlink({ seed: 'mosi' }), 60);
  const c = blinkStarts(createBlink({ seed: 'egill' }), 60);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  // A seek steps in other frame sizes; the blinks land within a frame of the same times.
  const d = blinkStarts(createBlink({ seed: 'mosi' }), 60, 1 / 60);
  assert.equal(d.length, a.length);
  d.forEach((t, i) => assert.ok(Math.abs(t - a[i]) < 1 / 30 + 1e-9, `blink ${i}: ${t} against ${a[i]}`));
});

test('a scene can rest the eyes half shut or shut, and open them again', () => {
  const blink = createBlink({ seed: 'mosi' });
  for (let i = 0; i < 30; i++) blink.update(1 / 30);
  blink.rest(0.5, 0.4);
  let level = 0;
  for (let i = 0; i < 12; i++) level = blink.update(1 / 30);
  // Half shut, blinking still: between blinks the lids rest at the half, in a blink they shut.
  let low = 1, high = 0;
  for (let i = 0; i < 30 * 20; i++) {
    level = blink.update(1 / 30);
    low = Math.min(low, level);
    high = Math.max(high, level);
  }
  assert.ok(Math.abs(low - 0.5) < 1e-6, `rests at ${low}`);
  assert.ok(high > 0.99, 'blinks from the half shut lids');
  // Shut: no blinking, the lids stay down.
  blink.rest(1, 0.3);
  for (let i = 0; i < 15; i++) blink.update(1 / 30);
  const count = blink.count;
  for (let i = 0; i < 30 * 20; i++) assert.ok(blink.update(1 / 30) > 0.999);
  assert.equal(blink.count, count, 'no blinks while the eyes are shut');
  blink.blink();
  assert.equal(blink.count, count, 'no blink on demand either');
  // Open again.
  blink.rest(0, 0.3);
  for (let i = 0; i < 15; i++) blink.update(1 / 30);
  low = 1;
  for (let i = 0; i < 30 * 10; i++) low = Math.min(low, blink.update(1 / 30));
  assert.equal(low, 0);
});

test('actors blink: the lids show only while they move, and a new look comes with a blink', async () => {
  for (const name of NAMES) {
    const world = emptyWorld();
    const actor = await createActor(world, { name, gltf: await loadCharacter(name) });
    world.actors.set(name, actor);
    const lids = actor.eyelids;
    assert.ok(lids, `${name} has eyelids`);
    assert.ok(eyesOf(actor.model), `${name}: its model carries eyes`);
    assert.equal(lids.mesh.skeleton, skinnedMeshOf(actor.model).skeleton, `${name}: the lids share the skin's skeleton`);
    assert.equal(lids.mesh.castShadow, false);
    let shown = 0, frames = 0;
    for (let i = 0; i < 30 * 12; i++) {
      actor.update(1 / 30);
      frames++;
      if (lids.mesh.visible) { shown++; assert.ok(lids.shut > 0.002); } else assert.ok(lids.shut <= 0.002);
    }
    assert.ok(lids.blink.count >= 2, `${name}: ${lids.blink.count} blinks in 12 s`);
    assert.ok(shown / frames < 0.2, `${name}: the lids showed in ${shown} of ${frames} frames`);
    // A glance at something new.
    for (let i = 0; i < 30 * 1; i++) actor.update(1 / 30);
    const before = lids.blink.count;
    if (!lids.blink.blinking) {
      actor.lookAt('camera');
      assert.equal(lids.blink.count, before + 1, `${name}: no blink with the new look`);
    }
    // Shut and opened by a scene; stop() opens them.
    actor.closeEyes(1, { duration: 0.2 });
    for (let i = 0; i < 10; i++) actor.update(1 / 30);
    assert.ok(lids.shut > 0.999 && lids.mesh.visible);
    actor.stop();
    for (let i = 0; i < 30; i++) actor.update(1 / 30);
    assert.equal(lids.blink.level, 0);
    actor.dispose();
    assert.equal(lids.mesh.parent, null, `${name}: dispose takes the lids away`);
  }
});
