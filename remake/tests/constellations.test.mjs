// The constellations (engine/constellations.js): each friend's own skeleton in stars on the night sky, a star on every joint and a
// line along every bone, drawn out from her head, moving as she moves (the festival's scene 2, chapters/hatid.js; Task 10).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor, rotateBoneWorld } from '../engine/actor.js';
import { bodyMesh } from '../engine/clip-probe.js';
import { createConstellations, skeletonLines, screenCorner, LINE_FEATHER, STAR_BONE, TIPS } from '../engine/constellations.js';
import { skyDirection } from '../engine/night-sky.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { SKY } from '../chapters/hatid-route.js';
import { loadCharacter, emptyWorld } from './characters.mjs';

const deg = THREE.MathUtils.radToDeg;
const SIX = FRIENDS.map(f => f.key);

async function actorOf(world, name) {
  const actor = await createActor(world, { name, gltf: await loadCharacter(name) });
  actor.update(0);
  actor.root.updateMatrixWorld(true);
  return actor;
}
function camera() {
  const c = new THREE.PerspectiveCamera(55, 1.6, 0.1, 1200);
  c.position.set(-30, 4, -40);
  c.lookAt(0, 30, 0);
  c.updateMatrixWorld();
  return c;
}
const dirOf = p => skyDirection(p.azimuth, p.elevation);
const apart = (a, b) => deg(dirOf(a).angleTo(dirOf(b)));
const byName = list => Object.fromEntries(list.map(p => [p.name, p]));
/** A place on the sky as degrees right and up of `at` (a tangent plane there), for angles between stars. */
function flat(at, p) {
  const h = dirOf(at);
  const east = new THREE.Vector3(-Math.sin(THREE.MathUtils.degToRad(at.azimuth)), 0, Math.cos(THREE.MathUtils.degToRad(at.azimuth)));
  const north = new THREE.Vector3().crossVectors(east, h).normalize();
  const d = dirOf(p);
  return [deg(Math.atan2(d.dot(east), d.dot(h))), deg(Math.atan2(d.dot(north), d.dot(h)))];
}
/** The turn in degrees on the sky from the way a -> b to the way c -> d (signed, counter-clockwise up). */
function turnOf(origin, a, b, c, d) {
  const [ax, ay] = flat(origin, a), [bx, by] = flat(origin, b), [cx, cy] = flat(origin, c), [dx, dy] = flat(origin, d);
  let t = deg(Math.atan2(dy - cy, dx - cx) - Math.atan2(by - ay, bx - ax));
  while (t > 180) t -= 360;
  while (t < -180) t += 360;
  return t;
}

test('a constellation is its friend\'s skeleton: for each of the six, a star on every joint but the root and a line from every bone to its parent (one line fewer than stars)', async () => {
  const world = emptyWorld();
  for (const name of SIX) {
    const actor = await actorOf(world, name);
    const bones = bodyMesh(actor).skeleton.bones;
    const { joints, lines, order } = skeletonLines(actor);
    assert.deepEqual([...joints].sort(), bones.filter(b => b.name !== 'root').map(b => b.name).sort(), `${name}: a star on every joint but the root`);
    assert.ok(joints.length >= 21 && joints.length <= 31, `${name}: ${joints.length} stars`);
    assert.equal(lines.length, joints.length - 1, `${name}: one line fewer than stars`);
    const has = (a, b) => lines.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    for (const bone of bones) {
      if (bone.name === 'root' || !bone.parent?.isBone || bone.parent.name === 'root') continue;
      assert.ok(has(bone.name, bone.parent.name), `${name}: ${bone.name} to its parent ${bone.parent.name}`);
    }
    // the bones that hang from the root (the four legs of the four-legged) are joined too: one picture, every star reached from the head
    const reached = new Set([STAR_BONE]);
    for (const [near, far] of order) { assert.ok(reached.has(near), `${name}: ${near} before ${far}`); reached.add(far); }
    assert.equal(reached.size, joints.length, `${name}: every star reached from the head`);
    assert.equal(order.length, lines.length);
    actor.dispose();
  }
  // tips are stars too, each joined to its bone
  const sloedla = await actorOf(world, 'sloedla');
  const tipped = skeletonLines(sloedla, { tips: TIPS.sloedla });
  assert.ok(tipped.joints.includes(TIPS.sloedla[0].name));
  assert.ok(tipped.lines.some(([a, b]) => a === TIPS.sloedla[0].name && b === TIPS.sloedla[0].bone));
  assert.equal(tipped.lines.length, tipped.joints.length - 1);
  assert.deepEqual(Object.keys(TIPS).sort(), ['flugedla', 'kambedla', 'sloedla', 'uggedla']);
  assert.deepEqual(Object.fromEntries(Object.entries(TIPS).map(([k, v]) => [k, v.length])), { sloedla: 1, uggedla: 3, kambedla: 4, flugedla: 1 });
});

test('it draws out from the head: at drawn 0.5 half the lines show, and every line shown touches one shown before it or the head', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'thorsedla');
  const sky = createConstellations(world);
  sky.add('thorsedla', actor, { colour: '#e9b14d', ...SKY.stars.thorsedla });
  const { order } = skeletonLines(actor);
  sky.set('thorsedla', { drawn: 0.5 });
  sky.update(camera());
  const shown = sky.linesOf('thorsedla').filter(l => l.shown > 0);
  assert.ok(Math.abs(shown.length - order.length / 2) <= 0.5, `${shown.length} of ${order.length}`);
  const touched = new Set([STAR_BONE]);
  for (const line of shown) {
    assert.ok(touched.has(line.near), `${line.near}-${line.far} touches one before it`);
    touched.add(line.far);
  }
  // a line grows from the star's side: half way along, its far end is half way
  const k = 0.5 * order.length - Math.floor(0.5 * order.length);
  if (k > 0) assert.ok(shown.at(-1).shown < 1);
  const stars = byName(sky.pointsOf('thorsedla'));
  assert.ok(stars[STAR_BONE].light > 0, 'the head is lit');
  const unlit = order.slice(Math.ceil(order.length / 2)).map(([, far]) => far);
  for (const far of unlit) assert.equal(stars[far].light, 0, `${far} not out yet`);
  sky.set('thorsedla', { drawn: 0 });
  assert.equal(sky.linesOf('thorsedla').filter(l => l.shown > 0).length, 0);
  assert.equal(sky.pointsOf('thorsedla').filter(p => p.light > 0).length, 1, 'at drawn 0 only the head\'s star');
  sky.set('thorsedla', { drawn: 1 });
  assert.equal(sky.linesOf('thorsedla').filter(l => l.shown === 1).length, order.length);
  sky.set('thorsedla', { level: 0 });
  assert.equal(sky.pointsOf('thorsedla').filter(p => p.light > 0).length, 0, 'level 0 is dark');
});

test('the head\'s star is the brightest, and is where starOf says', async () => {
  const world = emptyWorld();
  const sky = createConstellations(world);
  for (const [k, name] of SIX.entries()) {
    const actor = await actorOf(world, name);
    // anywhere on the top, turned any way, when she is added (a skin's bind matrices are the bind's, not where she is now)
    actor.place(9 * k - 20, 14 - 5 * k, 50 * k - 110);
    actor.update(0);
    actor.root.updateMatrixWorld(true);
    sky.add(name, actor, { colour: FRIENDS.find(f => f.key === name).colour, ...SKY.stars[name], tips: TIPS[name] ?? [] });
    sky.set(name, { drawn: 1, level: 1 });
  }
  sky.update(camera());
  for (const name of SIX) {
    const stars = sky.pointsOf(name);
    const head = stars.find(p => p.name === STAR_BONE);
    for (const p of stars) {
      if (p === head) continue;
      assert.ok(head.light > p.light, `${name}: the head brighter than ${p.name}`);
      assert.ok(Math.abs(head.size - 2 * p.size) < 1e-9, `${name}: the head twice the size of ${p.name}`);
    }
    assert.ok(apart(head, sky.starOf(name)) < 1e-6, `${name}: starOf is the head`);
    // as she stands in her bind pose's idle, her head is (near) where she was put
    assert.ok(apart(head, SKY.stars[name]) < 1.5, `${name}: ${apart(head, SKY.stars[name]).toFixed(2)} degrees from her place`);
    // her bind length covers `span` (16 degrees by default): she is about that wide on the sky
    const flats = stars.map(p => flat(SKY.stars[name], p)[0]);
    const wide = Math.max(...flats) - Math.min(...flats);
    assert.ok(wide > 12 && wide < 20, `${name}: ${wide.toFixed(1)} degrees wide`);
  }
});

test('it moves as she does: her neck turned 30 degrees turns the head\'s star about the neck\'s, and her walk moves its feet', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'sloedla');
  const sky = createConstellations(world);
  const at = SKY.stars.sloedla;
  sky.add('sloedla', actor, { colour: '#6793d0', ...at, tilt: 0, turn: 0 });
  sky.set('sloedla', {});
  const head = actor.model.getObjectByName(STAR_BONE);
  const neck = head.parent;
  const before = byName(sky.pointsOf('sloedla'));
  // turn her neck (the head's parent) 30 degrees up about her right
  const right = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.quaternion);
  rotateBoneWorld(neck, new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(30)));
  actor.root.updateMatrixWorld(true);
  const after = byName(sky.pointsOf('sloedla'));
  assert.ok(apart(before[neck.name], after[neck.name]) < 1e-6, 'the neck\'s star stays');
  const turn = turnOf(at, before[neck.name], before[STAR_BONE], after[neck.name], after[STAR_BONE]);
  assert.ok(Math.abs(Math.abs(turn) - 30) < 1, `the head's star turned ${turn.toFixed(2)} degrees about the neck's`);
  assert.ok(turn > 0, 'up, as she raised it');
  assert.ok(apart(before.Hips, after.Hips) < 1e-6, 'the body stays');
  // her walk (the clip, where she stands) moves her feet's stars
  actor.play('walk', { fade: 0 });
  const feet = ['FrontFootL', 'BackFootR'];
  const a = byName(sky.pointsOf('sloedla'));
  actor.update(0.35);
  actor.root.updateMatrixWorld(true);
  const b = byName(sky.pointsOf('sloedla'));
  for (const f of feet) assert.ok(apart(a[f], b[f]) > 0.15, `${f} moved ${apart(a[f], b[f]).toFixed(2)} degrees`);
});

test('where she stands and which way she faces on the top leave it where it was', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'kambedla');
  const sky = createConstellations(world);
  sky.add('kambedla', actor, { colour: '#8f6aa3', ...SKY.stars.kambedla, tips: TIPS.kambedla });
  sky.set('kambedla', {});
  const before = sky.pointsOf('kambedla');
  actor.root.position.set(23, 1.4, -17);
  actor.root.rotation.y = 2.1;
  actor.root.updateMatrixWorld(true);
  const after = sky.pointsOf('kambedla');
  before.forEach((p, i) => assert.ok(apart(p, after[i]) < 1e-6, `${p.name} stayed`));
  // and the camera's place does not move it either: it hangs from the camera, as the night sky does
  const c = camera();
  sky.update(c);
  const p1 = sky.group.position.clone();
  c.position.add(new THREE.Vector3(40, 3, 9));
  c.updateMatrixWorld();
  sky.update(c);
  assert.ok(sky.group.position.distanceTo(c.position) < 1e-9);
  assert.ok(p1.distanceTo(sky.group.position) > 39);
});

test('look turns the head toward a place in the sky and leaves the body', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'gramedla');
  const sky = createConstellations(world);
  const at = SKY.stars.gramedla;
  sky.add('gramedla', actor, { colour: '#b37955', ...at });
  sky.set('gramedla', {});
  const before = byName(sky.pointsOf('gramedla'));
  const look = { azimuth: at.azimuth + 4, elevation: at.elevation + 14 };
  sky.set('gramedla', { look });
  const after = byName(sky.pointsOf('gramedla'));
  const neck = actor.model.getObjectByName(STAR_BONE).parent.name;
  const way = turnOf(at, after[neck], after[STAR_BONE], after[neck], look);
  assert.ok(Math.abs(way) < 1.5, `the head points ${way.toFixed(2)} degrees off the place`);
  assert.ok(apart(before[STAR_BONE], after[STAR_BONE]) > 1, 'the head\'s star moved');
  assert.ok(apart(before[neck], after[neck]) > 0.1, 'and its neck\'s');
  assert.ok(apart(sky.starOf('gramedla'), after[STAR_BONE]) < 1e-6, 'starOf follows the head');
  for (const n of ['Hips', 'Spine', 'Chest', 'Tail6', 'LeftFoot', 'RightHand']) assert.ok(apart(before[n], after[n]) < 1e-6, `${n} stays`);
  // the jaw goes with the head
  assert.ok(apart(before.Jaw, after.Jaw) > 1);
  sky.set('gramedla', { look: null });
  const back = byName(sky.pointsOf('gramedla'));
  assert.ok(apart(before[STAR_BONE], back[STAR_BONE]) < 1e-6, 'look null gives the head back');
});

test('a tip rides its bone: Slóeðla\'s crest follows her head', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'sloedla');
  const sky = createConstellations(world);
  const at = SKY.stars.sloedla;
  const [crest] = TIPS.sloedla;
  assert.equal(crest.bone, STAR_BONE);
  sky.add('sloedla', actor, { colour: '#6793d0', ...at, tips: TIPS.sloedla, tilt: 0, turn: 0 });
  sky.set('sloedla', {});
  const before = byName(sky.pointsOf('sloedla'));
  // the crest rises behind her head, further from it than her jaw's star
  assert.ok(apart(before[crest.name], before[STAR_BONE]) > apart(before.Jaw, before[STAR_BONE]), 'the crest is long');
  const head = actor.model.getObjectByName(STAR_BONE);
  const right = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.quaternion);
  rotateBoneWorld(head, new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(-25)));
  actor.root.updateMatrixWorld(true);
  const after = byName(sky.pointsOf('sloedla'));
  const turn = turnOf(at, before[STAR_BONE], before[crest.name], after[STAR_BONE], after[crest.name]);
  assert.ok(Math.abs(turn + 25) < 1, `the crest turned ${turn.toFixed(2)} degrees with her head`);
  assert.ok(Math.abs(apart(after[crest.name], after[STAR_BONE]) - apart(before[crest.name], before[STAR_BONE])) < 0.05, 'rigid to it');
  assert.ok(apart(before.Hips, after.Hips) < 1e-6);
});

test('six constellations are two draw calls', async () => {
  const world = emptyWorld();
  const sky = createConstellations(world, { capacity: 6 });
  assert.equal(sky.group.parent, world.scene);
  const actors = {};
  for (const name of SIX) {
    const actor = actors[name] = await actorOf(world, name);
    sky.add(name, actor, { colour: FRIENDS.find(f => f.key === name).colour, ...SKY.stars[name], tips: TIPS[name] ?? [] });
    sky.set(name, { drawn: 1, level: 1, breath: 0.5 });
  }
  sky.update(camera());
  const drawn = [];
  sky.group.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine) && o.visible) drawn.push(o); });
  assert.equal(drawn.length, 2, 'the stars and the lines');
  assert.deepEqual(drawn.map(o => o.type).sort(), ['Mesh', 'Points'], 'the lines are one mesh of quads');
  for (const o of drawn) {
    assert.equal(o.material.fog, false);
    assert.equal(o.material.toneMapped, false);
    assert.equal(o.material.depthWrite, false);
    assert.equal(o.material.depthFunc, THREE.LessEqualDepth);
  }
  // a seventh does not fit
  const extra = await actorOf(world, 'mosi');
  assert.throws(() => sky.add('mosi', extra, { colour: '#4f5433', azimuth: 0, elevation: 30 }));
  // the same key again replaces hers, in her place
  const wideBefore = sky.pointsOf('sloedla');
  sky.add('sloedla', actors.sloedla, { colour: '#6793d0', ...SKY.stars.sloedla, span: 32, tips: TIPS.sloedla });
  sky.set('sloedla', {});
  const wideAfter = sky.pointsOf('sloedla');
  const across = list => { const f = list.map(p => flat(SKY.stars.sloedla, p)[0]); return Math.max(...f) - Math.min(...f); };
  assert.ok(Math.abs(across(wideAfter) / across(wideBefore) - 2) < 0.1, 'twice the span, twice as wide');
  sky.update(camera());
  const still = [];
  sky.group.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine) && o.visible) still.push(o); });
  assert.equal(still.length, 2);
  sky.dispose();
  assert.equal(sky.group.parent, null);
});

test('a line is lineWidth CSS pixels wide on the screen at pixel ratio 1 and 2, and grows from the star\'s side', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'thorsedla');
  const sky = createConstellations(world, { lineWidth: 2.5 });
  const at = SKY.stars.thorsedla;
  sky.add('thorsedla', actor, { colour: '#e9b14d', ...at });
  sky.set('thorsedla', { drawn: 0.5 });
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 1200);
  cam.position.set(0, 2, 0);
  cam.lookAt(skyDirection(at.azimuth, at.elevation).multiplyScalar(100).add(cam.position));
  cam.updateMatrixWorld();
  sky.update(cam);
  let lines = null;
  sky.group.traverse(o => { if (o.name === 'ConstellationLines') lines = o; });
  const css = [1280, 800];
  for (const ratio of [1, 2]) {
    const renderer = { getPixelRatio: () => ratio, getDrawingBufferSize: out => out.set(css[0] * ratio, css[1] * ratio) };
    lines.onBeforeRender(renderer);
    const u = lines.material.uniforms;
    assert.equal(u.uWidth.value, 2.5 * ratio, `ratio ${ratio}: device pixels`);
    assert.deepEqual(u.uViewport.value.toArray(), [css[0] * ratio, css[1] * ratio]);
    // the quad of the first line as the shader lays it: its two sides apart by the width and the soft edges, across the line
    const pos = lines.geometry.getAttribute('position');
    const other = lines.geometry.getAttribute('aOther');
    const a = new THREE.Vector3().fromBufferAttribute(pos, 0).add(sky.group.position);
    const b = new THREE.Vector3().fromBufferAttribute(other, 0).add(sky.group.position);
    const view = u.uViewport.value.toArray();
    for (const end of [0, 1]) {
      const l = screenCorner(a, b, end, -1, cam, view, u.uWidth.value);
      const r = screenCorner(a, b, end, 1, cam, view, u.uWidth.value);
      const wide = Math.hypot(r[0] - l[0], r[1] - l[1]);
      assert.ok(Math.abs(wide - (u.uWidth.value + 2 * LINE_FEATHER)) < 1e-6, `ratio ${ratio}: ${wide} device px across`);
      assert.ok(Math.abs(wide / ratio - (2.5 + 2 * LINE_FEATHER / ratio)) < 1e-6, 'the same CSS width but for the soft edge');
      const p = a.clone().project(cam), q = b.clone().project(cam);
      const along = [(q.x - p.x) * view[0], (q.y - p.y) * view[1]];
      assert.ok(Math.abs(along[0] * (r[0] - l[0]) + along[1] * (r[1] - l[1])) / Math.hypot(...along) < 1e-6, 'straight across the line');
    }
  }
  // a half-drawn line: its far end part way, from its near star; the near end is that star
  const shown = sky.linesOf('thorsedla');
  const part = shown.findIndex(l => l.shown > 0 && l.shown < 1);
  if (part >= 0) {
    const stars = Object.fromEntries(sky.pointsOf('thorsedla').map(p => [p.name, p.direction]));
    const pos = lines.geometry.getAttribute('position');
    const near = new THREE.Vector3().fromBufferAttribute(pos, 4 * part).normalize();
    const tip = new THREE.Vector3().fromBufferAttribute(pos, 4 * part + 2).normalize();
    assert.ok(near.angleTo(stars[shown[part].near]) < 1e-5, 'it starts at its near star');
    const whole = stars[shown[part].near].angleTo(stars[shown[part].far]);
    assert.ok(Math.abs(near.angleTo(tip) / whole - shown[part].shown) < 0.02, 'and reaches as far as it is shown');
  }
});
