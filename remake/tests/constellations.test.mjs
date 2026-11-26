// The constellations (engine/constellations.js): each friend as a line drawing on the night sky, her outline and a few inner lines
// traced from her own model (remake/tools/hatid-merki.mjs -> engine/constellation-figures.js), stars at key places, every point
// bound to her bones so it moves as she moves, drawn out from her own star (the festival's scene 2, chapters/hatid.js; Task 10b).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor, rotateBoneWorld } from '../engine/actor.js';
import { bodyMesh } from '../engine/clip-probe.js';
import { createConstellations, screenCorner, LINE_FEATHER, STAR_BONE, FIGURES } from '../engine/constellations.js';
import { skyDirection } from '../engine/night-sky.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { SKY } from '../chapters/hatid-route.js';
import { loadCharacter, emptyWorld } from './characters.mjs';

const deg = THREE.MathUtils.radToDeg;
const SIX = FRIENDS.map(f => f.key);
const HUE = Object.fromEntries(FRIENDS.map(f => [f.key, f.colour]));

async function actorOf(world, name) {
  const actor = await createActor(world, { name, gltf: await loadCharacter(name) });
  actor.update(0);
  actor.root.updateMatrixWorld(true);
  return actor;
}
/** She held in the pose her drawing was traced in. */
function bakedPose(actor, name) {
  const { clip, time } = FIGURES[name].pose;
  const action = actor.play(clip, { fade: 0, timeScale: 0 });
  action.time = time;
  actor.mixer.update(0);
  actor.root.updateMatrixWorld(true);
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
/** A place on the sky as degrees right and up of `at` (a tangent plane there). */
function flat(at, p) {
  const h = dirOf(at);
  const east = new THREE.Vector3(-Math.sin(THREE.MathUtils.degToRad(at.azimuth)), 0, Math.cos(THREE.MathUtils.degToRad(at.azimuth)));
  const north = new THREE.Vector3().crossVectors(east, h).normalize();
  const d = dirOf(p);
  return [deg(Math.atan2(d.dot(east), d.dot(h))), deg(Math.atan2(d.dot(north), d.dot(h)))];
}
const boneNames = actor => new Set(bodyMesh(actor).skeleton.bones.map(b => b.name));
/** Points of the figure carried by these bones alone. */
const carriedBy = (figure, names) => {
  const out = [];
  const p = figure.points;
  for (let i = 0; i < p.length / 9; i++) {
    const a = figure.bones[p[9 * i]], b = p[9 * i + 1] >= 0 ? figure.bones[p[9 * i + 1]] : null;
    if (names(a) && (b === null || names(b))) out.push(i);
  }
  return out;
};

test('a constellation is a drawing of its friend: a closed outline of points each bound to a bone of her own skeleton, and 8 to 14 stars on it, her own star the brightest at her head', async () => {
  const world = emptyWorld();
  const sky = createConstellations(world);
  assert.deepEqual(Object.keys(FIGURES).sort(), [...SIX].sort());
  for (const name of SIX) {
    const figure = FIGURES[name];
    const actor = await actorOf(world, name);
    const bones = boneNames(actor);
    // her outline: 80 to 200 points, each bound to one or two of her own bones with weights that add to one
    assert.ok(figure.outline >= 80 && figure.outline <= 200, `${name}: ${figure.outline} outline points`);
    const count = figure.points.length / 9;
    for (let i = 0; i < count; i++) {
      const p = figure.points.slice(9 * i, 9 * i + 9);
      assert.ok(bones.has(figure.bones[p[0]]), `${name}: point ${i} on ${figure.bones[p[0]]}, a bone of hers`);
      if (p[1] >= 0) assert.ok(bones.has(figure.bones[p[1]]), `${name}: point ${i} also on ${figure.bones[p[1]]}`);
      assert.ok(p[2] > 0 && p[2] <= 1 && (p[1] >= 0 || p[2] === 1), `${name}: point ${i} weight ${p[2]}`);
    }
    sky.add(name, actor, { colour: HUE[name], ...SKY.stars[name] });
    sky.set(name, { drawn: 1 });
    // closed: as many outline lines as outline points, each from one point to the next, the last back to the first
    const lines = sky.linesOf(name);
    const outline = lines.filter(l => l.kind === 'outline');
    assert.equal(outline.length, figure.outline, `${name}: a closed outline`);
    const ends = new Map();
    for (const l of outline) for (const e of [l.near, l.far]) ends.set(e, (ends.get(e) ?? 0) + 1);
    assert.ok([...ends.values()].every(n => n === 2) && ends.size === figure.outline, `${name}: every outline point joins two lines`);
    // 8 to 14 stars, her own (at the Head bone) the brightest and the biggest
    const stars = sky.pointsOf(name);
    assert.ok(stars.length >= 8 && stars.length <= 14, `${name}: ${stars.length} stars`);
    const own = stars.find(s => s.name === STAR_BONE);
    for (const s of stars) {
      if (s === own) continue;
      assert.ok(own.light > s.light, `${name}: her own star brighter than ${s.name}`);
      assert.ok(own.size > s.size, `${name}: and bigger than ${s.name}`);
    }
    assert.ok(new Set(stars.map(s => s.size)).size >= 3, `${name}: stars of three sizes`);
    assert.ok(apart(own, sky.starOf(name)) < 1e-6, `${name}: starOf is her own star`);
    // at her head: nearer the Head bone than any bone but the head's own (Head, Jaw)
    const root = actor.root.matrixWorld.clone().invert();
    const placeOf = bone => sky.skyOf(name, actor.model.getObjectByName(bone).getWorldPosition(new THREE.Vector3()).applyMatrix4(root));
    const toHead = apart(own, placeOf('Head'));
    for (const b of bones) {
      if (['Head', 'Jaw', 'root'].includes(b)) continue;
      assert.ok(apart(own, placeOf(b)) > toHead, `${name}: her star nearer her Head than her ${b}`);
    }
    // every other star sits on the drawing
    const drawing = sky.drawingOf(name);
    for (const s of stars) {
      if (s === own) continue;
      const near = Math.min(...drawing.map(p => apart(p, s)));
      assert.ok(near < 1e-6, `${name}: ${s.name} on the drawing (${near})`);
    }
    // traced in her telling pose, her own star is where she was put
    bakedPose(actor, name);
    assert.ok(apart(sky.starOf(name), SKY.stars[name]) < 0.05, `${name}: ${apart(sky.starOf(name), SKY.stars[name]).toFixed(3)} degrees from her place`);
    // she is about `span` (16 degrees) across
    const across = sky.outlineOf(name).map(p => flat(SKY.stars[name], p)[0]);
    const wide = Math.max(...across) - Math.min(...across);
    assert.ok(Math.abs(wide - 16) < 0.5, `${name}: ${wide.toFixed(2)} degrees across`);
  }
});

test('the drawing is hers: seen as shown, the outline of each lies on her own silhouette in the baked pose', async () => {
  const world = emptyWorld();
  const sky = createConstellations(world);
  for (const name of SIX) {
    const actor = await actorOf(world, name);
    bakedPose(actor, name);
    sky.add(name, actor, { colour: HUE[name], ...SKY.stars[name] });
    sky.set(name, {});
    // her skin as the sky shows it: every vertex of her body skinned now, in her root's frame, onto the sky
    const mesh = bodyMesh(actor);
    mesh.skeleton.update();
    const toRoot = new THREE.Matrix4().copy(actor.root.matrixWorld).invert().multiply(mesh.matrixWorld);
    const v = new THREE.Vector3();
    const at = SKY.stars[name];
    const skin = [];
    for (let i = 0; i < mesh.geometry.attributes.position.count; i += 2) skin.push(flat(at, sky.skyOf(name, mesh.getVertexPosition(i, v).applyMatrix4(toRoot))));
    const outline = sky.outlineOf(name).map(p => flat(at, p));
    // a sample of the outline: each point within 2 % of her width of her skin, and her outline as wide and high as her skin
    for (let k = 0; k < outline.length; k += 5) {
      const [x, y] = outline[k];
      let near = Infinity;
      for (const [sx, sy] of skin) near = Math.min(near, Math.hypot(sx - x, sy - y));
      assert.ok(near < 0.02 * 16, `${name}: outline point ${k} ${near.toFixed(3)} degrees off her skin`);
    }
    const box = list => [0, 1].map(a => Math.max(...list.map(p => p[a])) - Math.min(...list.map(p => p[a])));
    const [ow, oh] = box(outline), [sw, sh] = box(skin);
    assert.ok(Math.abs(ow / sw - 1) < 0.03 && Math.abs(oh / sh - 1) < 0.03, `${name}: outline ${ow.toFixed(2)}x${oh.toFixed(2)}, skin ${sw.toFixed(2)}x${sh.toFixed(2)}`);
  }
});

test('it draws out from her star: at drawn 0.25 only lines near the star show, at 1 all of them', async () => {
  const world = emptyWorld();
  const sky = createConstellations(world);
  for (const name of ['thorsedla', 'uggedla', 'flugedla']) {
    const actor = await actorOf(world, name);
    bakedPose(actor, name);
    sky.add(name, actor, { colour: HUE[name], ...SKY.stars[name] });
    const figure = FIGURES[name];
    const n = figure.outline;
    // it starts at the outline's point nearest her own star
    sky.set(name, { drawn: 0.25 });
    const own = sky.starOf(name);
    const drawing = sky.drawingOf(name);
    const nearest = drawing.slice(0, n).reduce((b, p, i) => (apart(p, own) < apart(drawing[b], own) ? i : b), 0);
    assert.equal(figure.start, nearest, `${name}: it starts nearest her star`);
    // at 0.25: only outline lines, each within a quarter of the way round from the start either way, and none of the inner lines
    const lines = sky.linesOf(name);
    const shown = lines.filter(l => l.shown > 0);
    assert.ok(shown.length > 0.15 * n && shown.length < 0.4 * n, `${name}: ${shown.length} of ${n} outline lines at 0.25`);
    for (const l of shown) {
      assert.equal(l.kind, 'outline', `${name}: no inner line yet`);
      const round = Math.min((l.near - figure.start + n) % n, (figure.start - l.near + n) % n);
      assert.ok(round <= 0.25 * n, `${name}: line from ${l.near} is ${round} points round from the start`);
    }
    // both ways round: lines on each side of the start
    assert.ok(shown.some(l => l.far === (l.near + 1) % n) && shown.some(l => l.far === (l.near - 1 + n) % n), `${name}: both ways round`);
    // the lit stars are her own and those the lines have reached
    const reached = new Set(shown.filter(l => l.shown === 1).flatMap(l => [l.near, l.far]));
    for (const s of sky.pointsOf(name)) if (s.light > 0 && s.name !== STAR_BONE) assert.ok(reached.has(s.point), `${name}: ${s.name} lit before its line reached it`);
    // at 0.5 still none of the inner lines; at 1 everything
    sky.set(name, { drawn: 0.5 });
    assert.ok(sky.linesOf(name).every(l => l.kind === 'outline' || l.shown === 0));
    sky.set(name, { drawn: 1 });
    assert.ok(sky.linesOf(name).every(l => l.shown === 1), `${name}: every line at 1`);
    assert.ok(sky.pointsOf(name).every(s => s.light > 0), `${name}: every star at 1`);
    sky.set(name, { drawn: 0 });
    assert.equal(sky.linesOf(name).filter(l => l.shown > 0).length, 0);
    assert.deepEqual(sky.pointsOf(name).filter(s => s.light > 0).map(s => s.name), [STAR_BONE], `${name}: at 0 only her own star`);
    sky.set(name, { level: 0 });
    assert.equal(sky.pointsOf(name).filter(s => s.light > 0).length, 0, 'level 0 is dark');
  }
});

test('it moves as she moves: lifting her head moves the head\'s points and leaves the tail\'s', async () => {
  const world = emptyWorld();
  for (const name of ['sloedla', 'gramedla']) {
    const actor = await actorOf(world, name);
    bakedPose(actor, name);
    const sky = createConstellations(world);
    sky.add(name, actor, { colour: HUE[name], ...SKY.stars[name] });
    sky.set(name, {});
    const figure = FIGURES[name];
    const before = sky.drawingOf(name);
    const ownBefore = sky.starOf(name);
    // lift her head: her neck's base (the Neck bone) turned 25 degrees up about her right
    const neck = actor.model.getObjectByName('Neck');
    const right = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.quaternion);
    rotateBoneWorld(neck, new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(25)));
    actor.root.updateMatrixWorld(true);
    const after = sky.drawingOf(name);
    assert.ok(apart(ownBefore, sky.starOf(name)) > 1, `${name}: her star moved ${apart(ownBefore, sky.starOf(name)).toFixed(2)} degrees`);
    assert.ok(sky.starOf(name).elevation > ownBefore.elevation, `${name}: up, as she lifted it`);
    const head = carriedBy(figure, b => b === 'Head' || b === 'Jaw');
    const tail = carriedBy(figure, b => /^Tail/.test(b));
    assert.ok(head.length >= 5 && tail.length >= 5, `${name}: ${head.length} head points, ${tail.length} tail points`);
    for (const i of head) assert.ok(apart(before[i], after[i]) > 0.5, `${name}: head point ${i} moved`);
    for (const i of tail) assert.ok(apart(before[i], after[i]) < 1e-4, `${name}: tail point ${i} stayed`);
    // no line tears: next points on the outline stay as close as they were, give or take what the turn bends
    const n = figure.outline;
    const longest = list => Math.max(...list.slice(0, n).map((p, i) => apart(p, list[(i + 1) % n])));
    assert.ok(longest(after) < 2.5 * longest(before), `${name}: the longest outline line ${longest(before).toFixed(2)} -> ${longest(after).toFixed(2)}`);
  }
  // her walk moves her legs' points
  const actor = await actorOf(world, 'thorsedla');
  const sky = createConstellations(world);
  sky.add('thorsedla', actor, { colour: HUE.thorsedla, ...SKY.stars.thorsedla });
  sky.set('thorsedla', {});
  actor.play('walk', { fade: 0 });
  actor.update(0.1);
  actor.root.updateMatrixWorld(true);
  const a = sky.drawingOf('thorsedla');
  actor.update(0.6);
  actor.root.updateMatrixWorld(true);
  const b = sky.drawingOf('thorsedla');
  const feet = carriedBy(FIGURES.thorsedla, n => /Foot/.test(n));
  assert.ok(feet.length >= 4);
  assert.ok(Math.max(...feet.map(i => apart(a[i], b[i]))) > 0.3, 'a foot moved');
});

test('where she stands and which way she faces on the top leave it where it was; it hangs from the camera', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'kambedla');
  const sky = createConstellations(world);
  sky.add('kambedla', actor, { colour: HUE.kambedla, ...SKY.stars.kambedla });
  sky.set('kambedla', {});
  const before = sky.drawingOf('kambedla');
  actor.root.position.set(23, 1.4, -17);
  actor.root.rotation.y = 2.1;
  actor.root.updateMatrixWorld(true);
  const after = sky.drawingOf('kambedla');
  before.forEach((p, i) => assert.ok(apart(p, after[i]) < 1e-4, `point ${i} stayed`));
  // facing -1 is her mirror image about her place
  sky.add('kambedla', actor, { colour: HUE.kambedla, ...SKY.stars.kambedla, facing: -1 });
  const mirror = sky.drawingOf('kambedla');
  const own = SKY.stars.kambedla;
  before.forEach((p, i) => {
    const [x, y] = flat(own, p), [mx, my] = flat(own, mirror[i]);
    assert.ok(Math.abs(x + mx) < 1e-3 && Math.abs(y - my) < 1e-3, `point ${i} mirrored`);
  });
  const c = camera();
  sky.update(c);
  c.position.add(new THREE.Vector3(40, 3, 9));
  c.updateMatrixWorld();
  sky.update(c);
  assert.ok(sky.group.position.distanceTo(c.position) < 1e-9);
});

test('look turns her head toward a place in the sky and leaves her body', async () => {
  const world = emptyWorld();
  const actor = await actorOf(world, 'gramedla');
  bakedPose(actor, 'gramedla');
  const sky = createConstellations(world);
  const at = SKY.stars.gramedla;
  sky.add('gramedla', actor, { colour: HUE.gramedla, ...at });
  sky.set('gramedla', {});
  const before = sky.drawingOf('gramedla');
  const look = { azimuth: at.azimuth + 3, elevation: at.elevation + 12 };
  sky.set('gramedla', { look });
  const after = sky.drawingOf('gramedla');
  const own = sky.starOf('gramedla');
  assert.ok(apart(own, at) > 1, 'her star moved');
  // her star now lies on the way from her neck's base toward the place
  const base = sky.lookPivotOf('gramedla');
  const [bx, by] = flat(at, base), [ox, oy] = flat(at, own), [lx, ly] = flat(at, look);
  const off = deg(Math.atan2(oy - by, ox - bx) - Math.atan2(ly - by, lx - bx));
  assert.ok(Math.abs(off) < 1.5, `her head points ${off.toFixed(2)} degrees off the place`);
  const figure = FIGURES.gramedla;
  for (const i of carriedBy(figure, b => /^(Tail|Left|Right|Hips)/.test(b))) assert.ok(apart(before[i], after[i]) < 1e-4, `body point ${i} stays`);
  for (const i of carriedBy(figure, b => b === 'Head' || b === 'Jaw')) assert.ok(apart(before[i], after[i]) > 0.5, `head point ${i} turns`);
  sky.set('gramedla', { look: null });
  assert.ok(apart(sky.starOf('gramedla'), at) < 0.05, 'look null gives her head back');
});

test('six constellations are two draw calls', async () => {
  const world = emptyWorld();
  const sky = createConstellations(world, { capacity: 6 });
  assert.equal(sky.group.parent, world.scene);
  const actors = {};
  for (const name of SIX) {
    const actor = actors[name] = await actorOf(world, name);
    sky.add(name, actor, { colour: HUE[name], ...SKY.stars[name] });
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
  assert.throws(() => sky.add('mosi', extra, { colour: '#4f5433', azimuth: 0, elevation: 30, figure: FIGURES.sloedla }));
  // the same key again replaces hers, in her place
  const across = list => { const f = list.map(p => flat(SKY.stars.sloedla, p)[0]); return Math.max(...f) - Math.min(...f); };
  const wideBefore = across(sky.outlineOf('sloedla'));
  sky.add('sloedla', actors.sloedla, { colour: HUE.sloedla, ...SKY.stars.sloedla, span: 32 });
  sky.set('sloedla', {});
  assert.ok(Math.abs(across(sky.outlineOf('sloedla')) / wideBefore - 2) < 0.1, 'twice the span, twice as wide');
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
  sky.add('thorsedla', actor, { colour: HUE.thorsedla, ...at });
  sky.set('thorsedla', { drawn: 0.3 });
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 1200);
  cam.position.set(0, 2, 0);
  cam.lookAt(skyDirection(at.azimuth, at.elevation).multiplyScalar(100).add(cam.position));
  cam.updateMatrixWorld();
  sky.update(cam);
  let lines = null;
  sky.group.traverse(o => { if (o.name === 'ConstellationLines') lines = o; });
  const listed = sky.linesOf('thorsedla');
  const whole = listed.findIndex(l => l.shown === 1);
  const css = [1280, 800];
  for (const ratio of [1, 2]) {
    const renderer = { getPixelRatio: () => ratio, getDrawingBufferSize: out => out.set(css[0] * ratio, css[1] * ratio) };
    lines.onBeforeRender(renderer);
    const u = lines.material.uniforms;
    assert.equal(u.uWidth.value, 2.5 * ratio, `ratio ${ratio}: device pixels`);
    assert.deepEqual(u.uViewport.value.toArray(), [css[0] * ratio, css[1] * ratio]);
    const pos = lines.geometry.getAttribute('position');
    const other = lines.geometry.getAttribute('aOther');
    const a = new THREE.Vector3().fromBufferAttribute(pos, 4 * whole).add(sky.group.position);
    const b = new THREE.Vector3().fromBufferAttribute(other, 4 * whole).add(sky.group.position);
    const view = u.uViewport.value.toArray();
    for (const end of [0, 1]) {
      const l = screenCorner(a, b, end, -1, cam, view, u.uWidth.value);
      const r = screenCorner(a, b, end, 1, cam, view, u.uWidth.value);
      const wide = Math.hypot(r[0] - l[0], r[1] - l[1]);
      assert.ok(Math.abs(wide - (u.uWidth.value + 2 * LINE_FEATHER)) < 1e-6, `ratio ${ratio}: ${wide} device px across`);
      const p = a.clone().project(cam), q = b.clone().project(cam);
      const along = [(q.x - p.x) * view[0], (q.y - p.y) * view[1]];
      assert.ok(Math.abs(along[0] * (r[0] - l[0]) + along[1] * (r[1] - l[1])) / Math.hypot(...along) < 1e-6, 'straight across the line');
    }
  }
  // a half-drawn line: from its near point, as far as it is shown
  const part = listed.findIndex(l => l.shown > 0 && l.shown < 1);
  assert.ok(part >= 0, 'a line part drawn at 0.3');
  const drawing = sky.drawingOf('thorsedla').map(p => dirOf(p));
  const pos = lines.geometry.getAttribute('position');
  const near = new THREE.Vector3().fromBufferAttribute(pos, 4 * part).normalize();
  const tip = new THREE.Vector3().fromBufferAttribute(pos, 4 * part + 2).normalize();
  assert.ok(near.angleTo(drawing[listed[part].near]) < 1e-5, 'it starts at its near point');
  const all = drawing[listed[part].near].angleTo(drawing[listed[part].far]);
  assert.ok(Math.abs(near.angleTo(tip) / all - listed[part].shown) < 0.02, 'and reaches as far as it is shown');
});
