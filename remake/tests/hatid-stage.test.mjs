// The festival's stage tools (Task 13): the floor of glow flowers (world/props/glow-floor.js) and the cones of light
// (engine/show/beams.js). The sea's colours and ripples are in fjall.test.mjs. Then the stage itself (Task 14,
// chapters/hatid-stage.js): it lights up part by part with the song's intro and its lights follow the song as pure functions of
// the beat.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGlowFloor, FLOOR_LOOK } from '../world/props/glow-floor.js';
import { createBeams } from '../engine/show/beams.js';
import { FLOOR, HEAD, STAGE, partyStands } from '../chapters/hatid-route.js';
import {
  STAGE_PARTS, FIREFLIES, FLOOR_FROM, partsAt, stonesAt, spotsAt, stringsAt, firefliesAt, seaAt, floorAt, partyLook, createStage,
  stonePlaces, stoneLightsAt, FRIEND_HUES,
} from '../chapters/hatid-stage.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { entered, cuesIn, soloAt, sectionAt, BEAT, END_BEAT } from '../chapters/hatid-score.js';
import { SONG } from '../chapters/hatid-song.js';
import { HATID_LOOKS } from '../chapters/hatid-looks.js';
import { createDusk } from '../engine/show/dusk.js';
import { lightTo } from '../engine/light-blend.js';

const heightAt = (x, z) => 1.2 + 0.3 * Math.sin(x * 0.07) * Math.sin(z * 0.06);
const world = () => ({ scene: new THREE.Scene(), heightAt });
const KEEP = [{ at: STAGE.centre, r: STAGE.radius + 1.5 }];
const flat = d => Math.hypot(d[0], d[2]);

test('the floor is one draw call and under 12k triangles; no flower stands on the stage', () => {
  const w = world();
  const floor = createGlowFloor(w, { heightAt, keep: KEEP });
  assert.deepEqual(w.scene.children, [floor.mesh], 'one mesh in the scene, nothing else');
  assert.ok(floor.mesh.isMesh && !Array.isArray(floor.mesh.material), 'one mesh, one material');
  assert.ok(floor.mesh.geometry.isInstancedBufferGeometry, 'its flowers are instances of one bloom');
  assert.equal(floor.mesh.geometry.instanceCount, FLOOR.count);
  assert.equal(floor.spots.length, FLOOR.count);
  assert.equal(floor.mesh.castShadow, false, 'no shadow pass: that would be a second draw call');
  const triangles = (floor.mesh.geometry.index.count / 3) * floor.mesh.geometry.instanceCount;
  assert.ok(triangles < 12000, `${triangles} triangles`);
  for (const [x, y, z] of floor.spots) {
    assert.ok(Math.hypot(x, z) <= FLOOR.radius + 1e-9, 'inside the floor');
    assert.ok(Math.abs(y - heightAt(x, z)) < 0.1, 'on the ground');
    for (const k of KEEP) assert.ok(Math.hypot(x - k.at[0], z - k.at[1]) >= k.r, `no flower on the stage: ${x}, ${z}`);
  }
  // spread over the whole floor, not bunched: every 5 m cell of it that is off the stage has a flower near
  for (let x = -25; x <= 25; x += 5) for (let z = -25; z <= 25; z += 5) {
    if (Math.hypot(x, z) > FLOOR.radius - 3 || KEEP.some(k => Math.hypot(x - k.at[0], z - k.at[1]) < k.r + 3)) continue;
    assert.ok(floor.spots.some(([sx, , sz]) => Math.hypot(sx - x, sz - z) < 4), `a flower near ${x}, ${z}`);
  }
  floor.dispose();
  assert.equal(w.scene.children.length, 0);
});

test('open is a wave: at 10 m the flowers within 10 m of the middle are open and those beyond are buds', () => {
  const floor = createGlowFloor(world(), { heightAt });
  const versions = Object.values(floor.mesh.geometry.attributes).map(a => a.version);
  for (let i = 0; i < floor.spots.length; i++) assert.equal(floor.flower(i).open, 0, 'as made all are buds');
  floor.set({ open: 10 });
  let inside = 0, beyond = 0;
  for (let i = 0; i < floor.spots.length; i++) {
    const d = flat(floor.spots[i]);
    const { open } = floor.flower(i);
    if (d <= 10 - FLOOR_LOOK.band) assert.ok(open > 1 - 1e-9, `open at ${d.toFixed(2)} m`);
    if (d < 10) { assert.ok(open > 0, `springing at ${d.toFixed(2)} m`); inside++; }
    if (d >= 10) { assert.equal(open, 0, `a bud at ${d.toFixed(2)} m`); beyond++; }
  }
  assert.ok(inside > 20 && beyond > 200, `${inside} open, ${beyond} buds`);
  // as it grows each flower only opens further (a wave going out), and all are open past the floor's edge
  const before = floor.spots.map((_, i) => floor.flower(i).open);
  floor.set({ open: 14 });
  floor.spots.forEach((_, i) => assert.ok(floor.flower(i).open >= before[i]));
  floor.set({ open: FLOOR.radius + 2 * FLOOR_LOOK.band });
  floor.spots.forEach((_, i) => assert.equal(floor.flower(i).open, 1));
  assert.equal(floor.mesh.material.uniforms.uOpen.value, FLOOR.radius + 2 * FLOOR_LOOK.band, 'a uniform');
  assert.deepEqual(Object.values(floor.mesh.geometry.attributes).map(a => a.version), versions, 'nothing written a flower at a time');
  floor.dispose();
});

test('a step lights the flowers under it and no others', () => {
  const floor = createGlowFloor(world(), { heightAt });
  floor.set({ open: 40, pulse: 0.3, colour: '#ff5fd2' });
  const base = floor.spots.map((_, i) => floor.flower(i).light);
  base.forEach(l => assert.ok(Math.abs(l - 0.3) < 1e-9, 'open flowers share the pulse'));
  const [x, , z] = floor.spots[7];
  const versions = Object.values(floor.mesh.geometry.attributes).map(a => a.version);
  floor.set({ steps: [[x, z, 1.6, 1]] });
  let lit = 0;
  floor.spots.forEach(([sx, , sz], i) => {
    const d = Math.hypot(sx - x, sz - z);
    const { light } = floor.flower(i);
    if (d >= 1.6) assert.equal(light, base[i], `no light at ${d.toFixed(2)} m`);
    else { assert.ok(light > base[i], `lit at ${d.toFixed(2)} m`); lit++; }
  });
  assert.ok(lit >= 1 && floor.flower(7).light >= 1.3 - 1e-9, 'the flower under the foot is the brightest');
  // at most sixteen; none is the rest
  floor.set({ steps: Array.from({ length: 20 }, (_, k) => [k, 0, 1, 1]) });
  assert.equal(floor.mesh.material.uniforms.uSteps.value.filter(v => v.w > 0).length, 16);
  floor.set({ steps: [] });
  floor.spots.forEach((_, i) => assert.equal(floor.flower(i).light, base[i]));
  assert.deepEqual(Object.values(floor.mesh.geometry.attributes).map(a => a.version), versions, 'uniforms only');
  floor.dispose();
});

test('the same numbers are the same floor', () => {
  const a = createGlowFloor(world(), { heightAt, keep: KEEP });
  const b = createGlowFloor(world(), { heightAt, keep: KEEP });
  assert.deepEqual(a.spots, b.spots);
  assert.deepEqual([...a.mesh.geometry.getAttribute('aSpot').array], [...b.mesh.geometry.getAttribute('aSpot').array]);
  const c = createGlowFloor(world(), { heightAt, keep: KEEP, seed: 7 });
  assert.notDeepEqual(a.spots, c.spots, 'another seed, another floor');
  const d = createGlowFloor(world(), { heightAt, count: 120, radius: 12 });
  assert.equal(d.spots.length, 120);
  assert.ok(d.spots.every(s => flat(s) <= 12));
  for (const f of [a, b, c, d]) f.dispose();
});

test('ten beams are one draw call', () => {
  const w = world();
  const beams = createBeams(w);
  assert.deepEqual(w.scene.children, [beams.mesh]);
  beams.begin();
  for (let k = 0; k < 11; k++) beams.beam([k, 16, 30], [k * 2, 1.2, 10], 1.5, 1, 0.8, 0.4, 0.9);
  beams.end();
  assert.equal(beams.count, 10, 'the capacity: the eleventh is dropped');
  assert.equal(beams.mesh.geometry.instanceCount, 10);
  assert.ok(!Array.isArray(beams.mesh.material) && beams.mesh.castShadow === false);
  assert.equal(beams.mesh.material.blending, THREE.CustomBlending, 'added to the picture');
  assert.ok((beams.mesh.geometry.index.count / 3) * 10 < 600, 'a few hundred triangles');
  const r = v => Math.round(v * 1e4) / 1e4;
  const third = beams.read(3);
  assert.deepEqual({ from: third.from.map(r), to: third.to.map(r), width: r(third.width), colour: third.colour.map(r) },
    { from: [3, 16, 30], to: [6, 1.2, 10], width: 1.5, colour: [1, 0.8, 0.4, 0.9] });
  beams.begin();
  beams.beam(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 0, 0), 2, 1, 1, 1, 0);
  beams.end();
  assert.equal(beams.count, 0, 'a beam with no light is not drawn');
  assert.equal(beams.mesh.visible, false);
  beams.dispose();
  assert.equal(w.scene.children.length, 0);
});

// -----------------------------------------------------------------------------------------------
// The stage (Task 14)

const entry = who => SONG.song.entries.find(e => e.who === who).beat;
const STANDS = partyStands();
const beatsOf = (from, to, step = 0.25) => { const out = []; for (let b = from; b < to - 1e-9; b += step) out.push(b); return out; };
const ALL = beatsOf(-2, END_BEAT + 8, 0.25);
const near = (a, b) => Math.hypot(a[0] - b[0], a[a.length === 3 ? 2 : 1] - b[b.length === 3 ? 2 : 1]);

test('the stage lights a part with each friend who comes into the song, in the intro\'s order, and all of it is on when the choir comes in', () => {
  assert.deepEqual(STAGE_PARTS.map(p => p.with), ['sloedla', 'sloedla', 'gramedla', 'kambedla', 'uggedla', 'thorsedla', 'flugedla', 'choir']);
  assert.deepEqual(STAGE_PARTS.map(p => p.part), ['stones', 'cone', 'floor', 'strings', 'sea', 'spots', 'fireflies', 'full']);
  let last = -Infinity;
  for (const { part, with: who } of STAGE_PARTS) {
    if (part === 'full') continue;
    const first = ALL.find(b => partsAt(b)[part] > 0);
    assert.ok(first !== undefined, `${part} is lit`);
    assert.ok(first >= entry(who), `${part} lights with ${who} (beat ${entry(who)}), not at ${first}`);
    assert.ok(first <= entry(who) + 4 + 0.25, `${part} lights within a bar of ${who}'s entry: ${first}`);
    assert.ok(first >= last, `${part} after the part before it`);
    last = first;
    for (const b of beatsOf(-2, entry(who))) assert.equal(partsAt(b)[part], 0, `${part} is dark at ${b}, before ${who}`);
  }
  const choir = entry('choir');
  assert.equal(choir, 76, 'the map\'s choir');
  for (const { part } of STAGE_PARTS) if (part !== 'full') assert.ok(partsAt(choir)[part] > 0, `${part} is on when the choir comes in`);
  for (const { part } of STAGE_PARTS) if (part !== 'full') assert.ok(partsAt(choir + 4)[part] > 1 - 1e-9, `${part} at full a bar after`);
  assert.ok(partsAt(choir - 1).floor < 1, 'and not at full before the choir');
  assert.ok(Math.abs(partsAt(choir + 4).full - entered('choir', choir + 4)) < 1e-9);
});

test('the stones rise before Slóeðla is lit and none moves after the intro', () => {
  const coneOn = ALL.find(b => partsAt(b).cone > 0);
  const first = stonesAt(-1);
  assert.equal(first.length, STAGE.stones);
  assert.ok(first.every(r => r === 0), 'under the ground before the song');
  assert.ok(stonesAt(coneOn).every(r => r === 1), 'all up before her light');
  // one after another: each starts after the one before it has started
  const starts = first.map((_, k) => ALL.find(b => stonesAt(b)[k] > 0));
  for (let k = 1; k < starts.length; k++) assert.ok(starts[k] > starts[k - 1], `stone ${k} after stone ${k - 1}`);
  assert.ok(starts.at(-1) - starts[0] <= 4, 'over a bar');
  for (const b of beatsOf(SONG.song.sections[1].startBeat, END_BEAT + 8, 0.5)) assert.deepEqual(stonesAt(b), first.map(() => 1), `still at ${b}`);
});

test('the floor springs open from Grameðla\'s feet on her first stomp and is whole a bar later', () => {
  const [stomp] = cuesIn('stomp', 0, END_BEAT);
  assert.equal(stomp.beat, entry('gramedla'));
  const feet = STANDS.gramedla.at;
  assert.ok(near(FLOOR_FROM, feet) < 0.5, 'the wave starts under her');
  const floor = createGlowFloor({ scene: new THREE.Scene() }, { heightAt, keep: KEEP, from: FLOOR_FROM });
  const opened = b => { floor.set(floorAt(b)); return floor.spots.map((_, i) => floor.flower(i).open); };
  assert.ok(opened(stomp.beat - 0.25).every(o => o === 0), 'all buds before her stomp');
  const mid = opened(stomp.beat + 2);
  const d = floor.spots.map(s => near(s, feet));
  const open = d.filter((_, i) => mid[i] > 0.99), buds = d.filter((_, i) => mid[i] === 0);
  assert.ok(open.length > 30 && buds.length > 30, `half way: ${open.length} open, ${buds.length} buds`);
  assert.ok(Math.max(...open) < Math.min(...buds), 'the open ones are those nearest her feet');
  assert.ok(opened(stomp.beat + 4).every(o => o === 1), 'whole a bar later');
  assert.ok(opened(300).every(o => o === 1), 'and stays whole');
  floor.dispose();
});

test('in every solo all four spotlights are on the soloist; in the quiet part every spotlight is dark and the fireflies drift', () => {
  for (const solo of SONG.song.solos) {
    const at = STANDS[solo.who].at;
    for (const b of beatsOf(solo.startBeat, solo.startBeat + solo.beats)) {
      assert.equal(soloAt(b).who, solo.who);
      const spots = spotsAt(b);
      assert.equal(spots.length, 4);
      for (const s of spots) {
        assert.ok(s.level > 0.2, `${solo.who} at ${b}: a spotlight at ${s.level}`);
        assert.ok(near(s.to, at) < 1.5, `${solo.who} at ${b}: a spotlight lands ${near(s.to, at).toFixed(2)} m off her`);
      }
    }
  }
  const quiet = SONG.song.sections.find(s => s.id === 'quiet');
  for (const b of beatsOf(quiet.startBeat, quiet.startBeat + quiet.beats)) for (const s of spotsAt(b)) assert.equal(s.level, 0, `dark at ${b}`);
  // the fireflies: loose swarms in the dance, drifting free and wide in the quiet part, slowly
  const spread = b => {
    const pts = Array.from({ length: FIREFLIES.count }, (_, i) => { const o = {}; firefliesAt(b, i, o); return [o.x, o.y, o.z, o.level]; });
    const swarmOf = i => i % FIREFLIES.swarms;
    let sum = 0;
    for (let k = 0; k < FIREFLIES.swarms; k++) {
      const mine = pts.filter((_, i) => swarmOf(i) === k);
      const c = [0, 1, 2].map(j => mine.reduce((s, p) => s + p[j], 0) / mine.length);
      sum += mine.reduce((s, p) => s + Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]), 0) / mine.length;
    }
    return { spread: sum / FIREFLIES.swarms, pts };
  };
  const dance = spread(100), still = spread(quiet.startBeat + 20), later = spread(quiet.startBeat + 21);
  assert.ok(still.spread > 2 * dance.spread, `wider in the quiet part: ${still.spread.toFixed(1)} m, in the dance ${dance.spread.toFixed(1)} m`);
  assert.ok(still.pts.every(p => p[3] > 0), 'and lit');
  const moved = still.pts.map((p, i) => Math.hypot(p[0] - later.pts[i][0], p[1] - later.pts[i][1], p[2] - later.pts[i][2]));
  assert.ok(moved.some(m => m > 0.05) && moved.every(m => m < 2.5 * BEAT), 'drifting: moving, slowly');
});

test('the sea beats with the song: its glow is highest on the beat, and a ripple leaves Grameðla on every stomp', () => {
  const hues = new Set();
  for (let beat = 80; beat < 340; beat++) {
    if (sectionAt(beat).id === 'quiet') continue;
    const on = seaAt(beat).glow;
    for (const k of [0.25, 0.5, 0.75]) assert.ok(seaAt(beat + k).glow < on, `the glow at ${beat + k} under the beat's`);
    // one colour at a time: a bar has one hue
    const bar = Math.floor(beat / 4) * 4;
    assert.equal(seaAt(beat).colour, seaAt(bar).colour, `one colour through the bar at ${beat}`);
    hues.add(seaAt(beat).colour);
  }
  assert.ok(hues.size >= 6, `${hues.size} hues over the song`);
  assert.equal(seaAt(30).glow, null, 'the sea is left as it was before Uggeðla comes in');
  const feet = STANDS.gramedla.at;
  for (const { beat } of cuesIn('stomp', 0, END_BEAT)) {
    const { ripples } = seaAt(beat + 0.25);
    const fresh = ripples.find(r => near(r.from, feet) < 0.5 && r.front < 0.25 * BEAT * 40 + 1e-6);
    assert.ok(fresh && fresh.strength > 0, `a ripple leaves her at ${beat}`);
    assert.ok(ripples.length <= 4);
    assert.ok(!seaAt(beat - 0.01).ripples.some(r => r.front < 0.25 * BEAT * 40 * 0.5), `none just before ${beat}`);
  }
});

/** How bright a world's light is: the sun's and the fill's strengths, times the exposure. */
const fakeLit = look => {
  const world = { lighting: { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight() }, renderer: { toneMappingExposure: 1 }, scene: new THREE.Scene() };
  lightTo(world, look);
  return world;
};
const brightness = world => (world.lighting.sun.intensity + world.lighting.hemi.intensity) * world.renderer.toneMappingExposure;

test('the party\'s light is a function of the beat: bright and warm in the dance (brighter than dark by half or more), dim in the quiet part, and never two lifts inside a second', () => {
  const world = fakeLit(HATID_LOOKS.night);
  const night = brightness(world);
  const dark = brightness(fakeLit(HATID_LOOKS.dark));
  const dusk = createDusk(world);
  const at = beat => { const { parts, lift } = partyLook(beat); dusk.mix(parts, lift); return { bright: brightness(world), sun: world.lighting.sun.color.clone() }; };
  for (const b of [80, 100, 120, 260, 300]) {
    const { bright, sun } = at(b + 0.5);
    assert.ok(bright >= 1.5 * dark, `the dance at ${b}: ${bright.toFixed(2)}, dark ${dark.toFixed(2)}`);
    assert.ok(sun.r > sun.b, `warm at ${b}: the sun ${sun.getHexString()}`);
  }
  const quiet = at(230).bright;
  assert.ok(quiet < at(100.5).bright, 'dimmer than the dance');
  assert.ok(Math.abs(quiet - (night + (dark - night) * 2 / 3)) < 0.12 * night, `two thirds of the way to dark: ${quiet.toFixed(2)} (night ${night.toFixed(2)}, dark ${dark.toFixed(2)})`);
  // the same beat, the same light, whatever came before
  const a = at(150.3); at(40); const b = at(150.3);
  assert.equal(a.bright, b.bright);
  assert.ok(a.sun.equals(b.sun));
  dusk.restore();
  assert.equal(brightness(world), night, 'put back as it was');
  // the lifts: a soft flash on a hit, never two starting inside a second
  const step = 1 / 30 / BEAT;
  const starts = [];
  let before = 0;
  for (let b = -2; b < END_BEAT + 8; b += step) {
    const { lift } = partyLook(b);
    assert.ok(lift >= 0 && lift <= 1);
    if (lift > 0.02 && before <= 0.02) starts.push(b);
    before = lift;
  }
  assert.ok(starts.length >= 10, `${starts.length} lifts`);
  for (let k = 1; k < starts.length; k++) assert.ok((starts[k] - starts[k - 1]) * BEAT >= 1, `lifts at ${starts[k - 1].toFixed(2)} and ${starts[k].toFixed(2)}`);
  for (const s of starts) assert.ok(cuesIn('hit', s - 0.5, s + 0.5).length === 1, `a lift on a hit at ${s.toFixed(2)}`);
});

/** A party world for the stage alone: a scene, a camera, the top's ground and a sea that keeps what it was given. */
function stageWorld({ reduced = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000);
  camera.position.set(-25, 5.4, -25);
  camera.lookAt(10, 3, 10);
  const sea = { given: [], glow: null, setGlow(v, colour) { this.glow = [v, colour]; }, ripples(list) { this.given = list; }, cards: null, bank: null };
  const world = { scene, camera, heightAt, lighting: { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight() }, renderer: { toneMappingExposure: 1 } };
  lightTo(world, HATID_LOOKS.night);
  const top = { heightAt, sea };
  return { world, top, reduced, stands: { party: partyStands() } };
}
/** What the stage drew: everything in the scene that draws, and its buffers. */
function drawn(world) {
  const out = [];
  world.scene.traverse(o => {
    if (!(o.isMesh || o.isPoints) || !o.visible) return;
    const g = o.geometry;
    const n = g.isInstancedBufferGeometry ? g.instanceCount : o.isInstancedMesh ? o.count : g.drawRange.count === Infinity ? g.index?.count ?? 1 : g.drawRange.count;
    if (!(n > 0)) return;
    const buffers = Object.fromEntries(Object.entries(g.attributes).filter(([, a]) => a.usage === THREE.DynamicDrawUsage || a.isInstancedBufferAttribute).map(([k, a]) => [k, [...a.array]]));
    const uniforms = o.material.uniforms ? Object.fromEntries(Object.entries(o.material.uniforms).filter(([k]) => k.startsWith('u')).map(([k, u]) => [k, JSON.stringify(u.value)])) : {};
    out.push({ name: o.name, n, buffers, uniforms, matrices: o.isInstancedMesh ? [...o.instanceMatrix.array] : null });
  });
  return out;
}

test('the stage draws the same picture at the same beat, in five draw calls', () => {
  const c = stageWorld();
  const stage = createStage(c);
  stage.update(100.4);
  const a = { picture: drawn(c.world), state: stage.state(), sea: JSON.stringify([c.top.sea.glow, c.top.sea.given]) };
  assert.equal(a.picture.length, 5, `five draw calls: ${a.picture.map(p => p.name).join(', ')}`);
  for (const o of a.picture) {
    let mesh = null;
    c.world.scene.traverse(x => { if (x.name === o.name) mesh = x; });
    assert.equal(mesh.castShadow, false, `${o.name} casts no shadow`);
  }
  stage.update(230);
  stage.update(17);
  stage.update(100.4);
  const b = { picture: drawn(c.world), state: stage.state(), sea: JSON.stringify([c.top.sea.glow, c.top.sea.given]) };
  assert.deepEqual(b.state, a.state, 'the same state');
  assert.deepEqual(b.picture, a.picture, 'the same buffers');
  assert.equal(b.sea, a.sea, 'the same sea');
  // the state holds what was written, all of it lit in the dance
  for (const part of ['cone', 'floor', 'strings', 'sea', 'spots', 'fireflies']) assert.ok(a.state.parts[part] === 1, part);
  assert.equal(a.state.counts.fireflies, FIREFLIES.count);
  assert.equal(a.state.counts.strings, 120);
  assert.ok(a.state.counts.points <= 600);
  stage.dispose();
  assert.equal(c.world.scene.children.length, 0, 'all gone');
  assert.equal(brightness(c.world), brightness(fakeLit(HATID_LOOKS.night)), 'the light as it was');
});

test('reduced: half the fireflies, the spotlights still, no lift', () => {
  const c = stageWorld({ reduced: true });
  const stage = createStage(c);
  stage.update(100.4);
  assert.equal(stage.state().counts.fireflies, FIREFLIES.count / 2);
  stage.dispose();
  const d = spotsAt(72.5, { reduced: true });
  for (let bar = 72; bar < 136; bar += 4) {
    const a = spotsAt(bar + 0.5, { reduced: true }), b = spotsAt(bar + 3.9, { reduced: true });
    a.forEach((s, k) => {
      assert.ok(near(s.to, b[k].to) < 1e-9 && near(s.to, d[k].to) < 1e-9, `spot ${k} still at ${bar}`);
      assert.deepEqual(s.from, b[k].from);
    });
  }
  // without reduced they sweep
  assert.ok(spotsAt(100.5).some((s, k) => near(s.to, spotsAt(103.9)[k].to) > 1));
  for (let b = -2; b < END_BEAT + 8; b += 0.1) assert.equal(partyLook(b, { reduced: true }).lift, 0, `no lift at ${b}`);
  assert.ok(stringsAt(100).length === 120);
});

// -----------------------------------------------------------------------------------------------
// Seven more things on the stage (Task 14b, the owner's word of 2026-11-26)

test('each stone lights in its friend\'s hue when she comes into the song, and the soloist\'s stone is the brightest in her solo', () => {
  const places = stonePlaces();
  assert.equal(places.length, STAGE.stones, 'taller, not more');
  for (const f of FRIENDS) assert.equal(places.filter(p => p.who === f.key).length, 1, `one stone is ${f.key}'s`);
  for (const p of places) {
    assert.ok(p.height > HEAD.gramedla[1] + 1, `a stone ${p.height} m high stands over Grameðla's head`);
    assert.ok(Math.hypot(...p.at) > FLOOR.radius, 'round the dance floor, off it');
  }
  const fromOf = who => SONG.song.entries.some(e => e.who === who) ? entry(who) : entry('choir'); // Mosi's, Egill's, the choir's
  places.forEach((p, k) => {
    const from = fromOf(p.who);
    for (const b of beatsOf(-2, from)) assert.equal(stoneLightsAt(b)[k].level, 0, `${p.who}'s stone dark at ${b}`);
    const lit = stoneLightsAt(from + 1)[k];
    assert.ok(lit.level > 0.5, `${p.who}'s stone lit a beat after she comes in: ${lit.level}`);
    assert.equal(lit.colour, FRIEND_HUES[p.who], `${p.who}'s stone in her hue`);
    assert.equal(lit.who, p.who);
    for (const b of beatsOf(from + 1, END_BEAT)) assert.ok(stoneLightsAt(b)[k].level > 0, `${p.who}'s stone stays lit at ${b}`);
  });
  for (const solo of SONG.song.solos) {
    const k = places.findIndex(p => p.who === solo.who);
    for (const b of beatsOf(solo.startBeat, solo.startBeat + solo.beats)) {
      const lights = stoneLightsAt(b);
      lights.forEach((l, j) => { if (j !== k) assert.ok(lights[k].level > l.level, `${solo.who}'s stone the brightest at ${b} (${lights[k].level} against ${l.who}'s ${l.level})`); });
    }
  }
  assert.deepEqual(stoneLightsAt(130.3), stoneLightsAt(130.3), 'a function of the beat');
});
