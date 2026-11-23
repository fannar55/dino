// Chapter 6 (remake/chapters/kafli6.js) played untouched from start to end: Mosi's and Grameðla's feet stand on the ground the eye
// sees, and in scenes 6 and 7 (her coming, the sniff, his invitation, the climb, the top) her body keeps out of Mosi and Egill
// (the owner's F1 reports 2, 6, 7, 8 and 11 of 2026-11-23). Her head and jaw are never in the ground, anywhere in the chapter, and
// from the cut to Egill on her head to the end she walks upright with her head high: her spine within PITCH degrees of level, her
// head HEAD_UP m or more over the ground. Above the clouds both stand whole on the top's flat before Egill's line, every foot seen
// from the camera at either shape of screen (the owner's frame of 2026-11-23: "haus á grameðlu lengst í grasi").
//
// The ground is read from the stage's own ground meshes (every visible mesh named ground or summit that is a regular grid), triangle
// by triangle as the GPU draws it, not from the chapter's height functions. A foot is its skinned vertices (the foot bones carry them
// most); a foot is "planted" in a frame when its lowest point moved under 4 mm in each of the STILL frames up to it (a slow step's
// top, still for a frame or two, is not a planted foot). Sampled: the feet and her head in every frame; the bodies in every second
// frame of scenes 6 and 7 (her every second vertex, theirs all); above the clouds each foot's lowest point, a ray to it from the camera
// sampled every 0.2 m, in a second play on an upright screen too. Her pitch is her spine's, hips to neck against the level.
// Not counted: Mosi's feet while he hops on the ford's stones (he stands on a stone there, not the ground), and feet deep in the
// sea of cloud under the top's rim (lower than CLOUD_FLOOR: the cloud there hides everything under it); her head is counted everywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as kafli6 from '../chapters/kafli6.js';
import * as THREE from 'three';
import { playUnattended } from './chapter-harness.mjs';
import { skinPoints, pointIndex } from '../chapters/kafli6-seat.js';

const UNDER = 0.03, OVER = 0.05, MARGIN = 0.05, STILL = 5;
const PITCH = 20, HEAD_UP = 1, BEFORE_LINE = 1; // degrees; m; s before Egill's line above the clouds that both stand whole on the flat
const CLOUD_FLOOR = -7; // world/fjall/top.js: the sea of cloud's level round the top; feet lower than it are in the cloud
const FEET = {
  mosi: { FL: ['FrontFootL'], FR: ['FrontFootR'], BL: ['BackFootL'], BR: ['BackFootR'] },
  gramedla: { L: ['LeftFoot'], R: ['RightFoot'] },
};
const HER = { head: ['Head', 'Jaw'], neck: ['Neck'], chest: ['Chest', 'Spine'], arms: ['LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightUpperArm', 'RightLowerArm', 'RightHand'], belly: ['Hips'], legs: ['LeftThigh', 'RightThigh', 'LeftShin', 'RightShin', 'LeftFoot', 'RightFoot'], tail: ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6'] };
const MOSI = { head: ['Head', 'Jaw'], neck: ['Neck', 'Shoulders'], body: ['Body'], legs: ['FrontLegL', 'FrontLegR', 'FrontFootL', 'FrontFootR', 'BackLegL', 'BackLegR', 'BackFootL', 'BackFootR'], tail: ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'] };
const EGILL = { egill: ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftShoulder', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightShoulder', 'RightUpperArm', 'RightLowerArm', 'RightHand', 'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'RightUpperLeg', 'RightLowerLeg', 'RightFoot'] };

/** A stage's ground meshes as grids read from their geometry: [{ x0, z0, step, n, p, mesh }]. */
const grids = new WeakMap();
function gridsOf(stage) {
  if (!stage?.group) return [];
  if (grids.has(stage)) return grids.get(stage);
  const list = [];
  stage.group.traverse(o => {
    if (!o.isMesh || !/ground|summit/i.test(o.name) || !o.geometry?.index) return;
    const p = o.geometry.attributes.position.array, n1 = Math.round(Math.sqrt(p.length / 3));
    if (n1 * n1 * 3 !== p.length) return;
    const step = p[3] - p[0];
    if (Math.abs(p[n1 * 3 + 2] - p[2] - step) < 1e-3) list.push({ x0: p[0], z0: p[2], step, n: n1 - 1, p, mesh: o });
  });
  grids.set(stage, list);
  return list;
}
/** The drawn ground's height at (x, z): the triangle of the first visible grid over it (each cell split from (i+1, j) to (i, j+1)). */
function seenAt(stage, x, z) {
  for (const g of gridsOf(stage)) {
    if (!g.mesh.visible) continue;
    const fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= g.n || j >= g.n) continue;
    const u = fx - i, v = fz - j, n1 = g.n + 1, h = (a, b) => g.p[(b * n1 + a) * 3 + 1];
    if (u + v <= 1) return h(i, j) + u * (h(i + 1, j) - h(i, j)) + v * (h(i, j + 1) - h(i, j));
    return h(i + 1, j + 1) + (1 - u) * (h(i, j + 1) - h(i + 1, j + 1)) + (1 - v) * (h(i + 1, j) - h(i + 1, j + 1));
  }
  return stage?.heightAt?.(x, z) ?? null;
}

const found = { under: [], over: [], near: { mosi: [], egill: [] }, feetFrames: 0, bodyFrames: 0, head: { d: Infinity }, upright: [] };
const hips = new THREE.Vector3(), neck = new THREE.Vector3();
/** Her head's and jaw's lowest point over the drawn ground, and her spine's pitch (hips to neck against the level, degrees). */
function herHead(world, store) {
  const her = world.actors.get('gramedla');
  store.headPoints ??= skinPoints(her, { head: HER.head });
  const p = store.headPoints.update().head;
  let low = Infinity;
  for (let k = 0; k < p.length; k += 3) {
    const g = seenAt(world.forest, p[k], p[k + 2]);
    if (g !== null) low = Math.min(low, p[k + 1] - g);
  }
  her.model.getObjectByName('Hips').getWorldPosition(hips);
  her.model.getObjectByName('Neck').getWorldPosition(neck);
  return { low, pitch: THREE.MathUtils.radToDeg(Math.atan2(neck.y - hips.y, Math.hypot(neck.x - hips.x, neck.z - hips.z))) };
}
/** Above the clouds, each frame: is every foot of both on the top's flat, on the screen, and seen (no drawn ground between it and the
 * camera: a ray to its lowest point, sampled every 0.2 m, meets no ground more than 2 cm over it)? */
const feetSeen = {};
function standWhole(world, c, list) {
  if (c.shotLabel !== 'above_clouds') return;
  const cam = world.camera.position, top = world.forest, off = [];
  world.camera.updateMatrixWorld();
  for (const who of ['mosi', 'gramedla']) {
    feetSeen[who] ??= skinPoints(world.actors.get(who), FEET[who]);
    for (const [foot, pts] of Object.entries(feetSeen[who].update())) {
      let low = null;
      for (let k = 0; k < pts.length; k += 3) if (!low || pts[k + 1] < low[1]) low = [pts[k], pts[k + 1], pts[k + 2]];
      const why = [];
      if (Math.hypot(low[0], low[2]) > top.radius) why.push('off the flat');
      const q = new THREE.Vector3(...low).project(world.camera);
      if (Math.abs(q.x) > 1 || Math.abs(q.y) > 1 || q.z > 1) why.push('off the screen');
      const dx = low[0] - cam.x, dy = low[1] - cam.y, dz = low[2] - cam.z, len = Math.hypot(dx, dy, dz);
      for (let d = 0.5; d < len - 0.4; d += 0.2) {
        const g = seenAt(top, cam.x + (dx * d) / len, cam.z + (dz * d) / len);
        if (g !== null && cam.y + (dy * d) / len < g - 0.02) { why.push('behind the ground'); break; }
      }
      if (why.length) off.push(`${who}.${foot} ${why.join(', ')}`);
    }
  }
  list.push({ t: c.s.time, off });
}
const whole = { 1.6: [], 0.625: [] };
const worst = list => list.reduce((a, b) => (b.d < a.d ? b : a), { d: Infinity });
const run = await playUnattended(kafli6, {
  seeking: false, limit: 620, shaped: true, aspect: 1.6,
  onFrame({ world }) {
    const c = world.chapterState;
    if (!c || typeof c.scene !== 'number') return;
    const frame = Math.round(c.s.time * 30), t = +c.s.time.toFixed(2);
    found.feetFrames++;
    if (world.actors.get('gramedla').root.visible) {
      const { low, pitch } = herHead(world, found);
      if (low < found.head.d) found.head = { d: low, t, scene: c.scene, shot: c.shotLabel };
      if (c.scene === 7 && (found.risen ||= c.shotLabel === 'on_her_head')) found.upright.push({ t, shot: c.shotLabel, low, pitch });
    }
    if (c.scene === 7) standWhole(world, c, whole[1.6]);
    for (const who of ['mosi', 'gramedla']) {
      const actor = world.actors.get(who);
      if (!actor.root.visible) { found[who] = null; continue; }
      found[`${who}Feet`] ??= skinPoints(actor, FEET[who]);
      const now = found[`${who}Feet`].update();
      for (const [foot, pts] of Object.entries(now)) {
        let low = Infinity, lowY = Infinity, x = 0, z = 0;
        for (let k = 0; k < pts.length; k += 3) {
          const g = seenAt(world.forest, pts[k], pts[k + 2]);
          if (g === null) continue;
          if (pts[k + 1] - g < low) { low = pts[k + 1] - g; x = pts[k]; z = pts[k + 2]; }
          lowY = Math.min(lowY, pts[k + 1]);
        }
        const key = `${who}.${foot}`, prev = found[key];
        const still = prev && Math.abs(lowY - prev.lowY) + Math.hypot(x - prev.x, z - prev.z) < 0.004 ? prev.still + 1 : 0;
        found[key] = { lowY, x, z, still };
        if (low === Infinity || lowY < CLOUD_FLOOR || (who === 'mosi' && actor.controlled)) continue;
        const planted = still >= STILL;
        if (low < -UNDER) found.under.push({ t, scene: c.scene, key, d: low });
        if (planted && low > OVER) found.over.push({ t, scene: c.scene, key, d: -low });
      }
    }
    if ((c.scene !== 6 && c.scene !== 7) || frame % 2) return;
    const her = world.actors.get('gramedla');
    if (!her.root.visible) return;
    found.parts ??= { her: skinPoints(her, HER, { stride: 2 }), mosi: skinPoints(world.actors.get('mosi'), MOSI), egill: skinPoints(world.actors.get('egill'), EGILL) };
    const seated = c.chapterLog.some(e => e.type === 'onHerHead'); // Egill sits on her head from here: that touch is the seat
    const h = found.parts.her.update();
    found.bodyFrames++;
    for (const who of ['mosi', 'egill']) {
      if (who === 'egill' && seated) continue;
      const best = pointIndex(found.parts[who].update(), 0.3).least(h);
      found.near[who].push({ t, scene: c.scene, d: best.d, her: best.a, his: best.b });
    }
  },
});

// The same play on a tablet held upright, for the feet above the clouds
const tall = await playUnattended(kafli6, {
  seeking: false, limit: 620, shaped: true, aspect: 0.625,
  onFrame({ world }) {
    const c = world.chapterState;
    if (c?.scene === 7) standWhole(world, c, whole[0.625]);
  },
});

const show = list => list.slice(0, 6).map(e => `${e.t} s ${e.key ?? `her ${e.her} / ${e.his}`} ${(e.d * 100).toFixed(1)} cm`).join('; ');

test('the untouched play ran to its end and was sampled', () => {
  assert.ok(run.world.chapterTimeline.at(-1).scene === 'end', 'the play reached its end');
  assert.ok(found.feetFrames > 13000, `feet read in ${found.feetFrames} frames`);
  assert.ok(found.bodyFrames > 1500, `bodies read in ${found.bodyFrames} frames`);
});

test(`no foot of Mosi or Grameðla is more than ${UNDER * 100} cm under the seen ground in any frame`, () => {
  assert.equal(found.under.length, 0, `${found.under.length} feet under, the worst: ${show([...found.under].sort((a, b) => a.d - b.d))}`);
});

test(`no planted foot stands more than ${OVER * 100} cm over the seen ground`, () => {
  assert.equal(found.over.length, 0, `${found.over.length} planted feet over, the most: ${show([...found.over].sort((a, b) => a.d - b.d))}`);
});

test(`in scenes 6 and 7 her body keeps more than ${MARGIN * 100} cm from Mosi and from Egill (but for his seat on her head)`, () => {
  for (const who of ['mosi', 'egill']) {
    const list = found.near[who];
    assert.ok(list.length > 100, `${who} measured in ${list.length} frames`);
    const into = list.filter(e => e.d < MARGIN);
    assert.equal(into.length, 0, `her body within ${MARGIN} m of ${who} in ${into.length} frames, the least: ${show([worst(list)])}`);
  }
});

test('no point of her head or jaw is under the drawn ground in any frame of the chapter', () => {
  const h = found.head;
  assert.ok(h.d >= 0, `her head ${(-h.d * 100).toFixed(1)} cm into the ground at ${h.t} s (scene ${h.scene}, ${h.shot})`);
});

test(`from the cut to Egill on her head to the end, her spine stays within ${PITCH} degrees of level and her head ${HEAD_UP} m or more over the ground`, () => {
  const list = found.upright;
  assert.ok(list.length > 900, `measured in ${list.length} frames`);
  const tipped = list.filter(e => Math.abs(e.pitch) >= PITCH), low = list.filter(e => e.low < HEAD_UP);
  const at = e => `${e.t} s (${e.shot}): pitch ${e.pitch.toFixed(1)}, head ${e.low.toFixed(2)} m over the ground`;
  assert.equal(tipped.length, 0, `her spine tipped ${PITCH} degrees or more in ${tipped.length} frames, the first ${tipped[0] && at(tipped[0])}`);
  assert.equal(low.length, 0, `her head under ${HEAD_UP} m over the ground in ${low.length} frames, the first ${low[0] && at(low[0])}`);
});

test(`above the clouds both stand whole on the top's flat, every foot seen, for ${BEFORE_LINE} s before Egill's line, wide and upright`, () => {
  for (const [aspect, played] of [[1.6, run], [0.625, tall]]) {
    const line = played.seen.said.find(e => e.id === 'k6_egill_above');
    assert.ok(line, `${aspect}: Egill's line above the clouds is said`);
    const before = whole[aspect].filter(e => e.t >= line.at - BEFORE_LINE && e.t <= line.at);
    assert.ok(before.length > 20, `${aspect}: ${before.length} frames above the clouds before the line`);
    const off = before.filter(e => e.off.length);
    assert.equal(off.length, 0, `${aspect}: ${off.length} frames with a foot not whole on the flat, the first at ${off[0]?.t.toFixed(2)} s: ${off[0]?.off.join('; ')}`);
  }
});
