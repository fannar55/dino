// The flight camera (engine/camera/flight-camera.js): bound shots ride with Flugeðla and lean a third of her bank (never past 8
// degrees), fixed shots stand still and turn to keep her in view, and the flight's own rules are linted into director.warnings. Every
// named shot frames her and Egill whole, on a 16:10 screen and on an upright tablet, with the camera never inside her.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chapterWorld } from './chapter-harness.mjs';
import { updateActors } from '../engine/actor.js';
import { createDirector } from '../engine/camera/director.js';
import { createFlier, rideFlier } from '../engine/flier.js';
import { createFlightCamera, FLIGHT_RULES, CLEAR, stillViews } from '../engine/camera/flight-camera.js';
import { createRoute, BEATS, CALL_SHOTS, STILLS, NESTS } from '../chapters/kafli4-route.js';
import { createTerrain } from '../world/ardalur/terrain.js';
import { rainbowLevel } from '../world/props/waterfall.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';

const deg = THREE.MathUtils.radToDeg;
const world = await chapterWorld({
  look: 'lateMorning',
  actors: { flugedla: { url: '../assets/characters/pteranodon.glb' }, egill: { url: '../assets/characters/egill.glb' } },
});
const flugedla = world.actors.get('flugedla');
const egill = world.actors.get('egill');
const route = createRoute();
world.heightAt = createTerrain(route).heightAt; // the valley's ground, for the camera's floor and the fixed shots
const DT = 1 / 30;

function setUp({ reduced = false } = {}) {
  world.camera.aspect = 1.6;
  world.camera.updateProjectionMatrix();
  const director = createDirector({ camera: world.camera, world, lint: false });
  const flier = createFlier(flugedla, route, { world, reduced });
  const riding = rideFlier(egill, flier);
  const camera = createFlightCamera(director, flier, { world, egill, reduced });
  let t = 0;
  const to = (time, each = () => {}) => {
    for (; t <= time + 1e-9; t += DT) {
      flier.update(t);
      updateActors(world.actors.values(), DT);
      director.update(DT);
      each(t);
    }
  };
  const at = time => { t = time; flier.update(t); updateActors(world.actors.values(), DT); };
  const done = () => { riding.stop(); flier.stop(); };
  return { director, flier, camera, to, at, done, flight: () => director.warnings.filter(w => w.message.startsWith('flight:')) };
}

test('roll follows a third of her bank and never exceeds 8 degrees', () => {
  const { director, flier, camera, to, at, done, flight } = setUp();
  at(6);
  camera.shot('chase');
  let most = 0;
  let checked = 0;
  to(BEATS.END - 1, t => {
    assert.ok(Math.abs(camera.roll) <= FLIGHT_RULES.roll + 1e-9, `t=${t.toFixed(1)}: roll ${camera.roll}`);
    if (Math.abs(flier.bank) < 3 * FLIGHT_RULES.roll - 1) {
      assert.ok(Math.abs(camera.roll - flier.bank / 3) < 0.6, `t=${t.toFixed(1)}: roll ${camera.roll.toFixed(2)} for a bank of ${flier.bank.toFixed(1)}`);
    }
    most = Math.max(most, Math.abs(camera.roll));
    if (Math.abs(camera.roll) > 2) {
      // the camera itself leans: its right side goes down as she banks right
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(world.camera.quaternion);
      assert.equal(Math.sign(right.y), -Math.sign(camera.roll), `t=${t.toFixed(1)}`);
      checked++;
    }
  });
  assert.ok(most > 5 && checked > 10, `it leans (at most ${most.toFixed(1)} degrees)`);
  assert.deepEqual(flight(), [], 'a chase that rides with her keeps the rules');
  assert.equal(director.mode, 'drive');
  done();
});

test('a shot shorter than 2.5 s warns, a quick one of 1.5 s does not, the fourth quick one does', () => {
  const { camera, to, at, done, flight } = setUp();
  at(80);
  camera.shot('chase');
  to(82);
  camera.shot('face');
  assert.equal(flight().length, 1);
  assert.match(flight()[0].message, /shot "chase" lasted 2\.0\d s \(min 2\.5 s\)/);
  to(85);
  for (let i = 0; i < 3; i++) {
    camera.shot(i % 2 ? 'face' : 'chase', { quick: true });
    to(85 + 1.55 * (i + 1));
  }
  camera.shot('side');
  assert.equal(flight().length, 1, 'three quick shots of 1.5 s are allowed');
  to(92.5);
  camera.shot('chase', { quick: true });
  assert.equal(flight().length, 2);
  assert.match(flight()[1].message, /quick shot number 4/);
  done();
});

test('a fixed shot panning faster than 40 deg/s warns', () => {
  const calm = setUp();
  calm.at(24);
  calm.camera.shot('waterLevel'); // 11 m off her path, 4.5 s ahead of her
  calm.to(27.5);
  calm.camera.shot('chase');
  assert.deepEqual(calm.flight(), [], 'a fixed shot placed well keeps the rules');
  calm.done();

  const close = setUp();
  close.at(24);
  close.camera.shot('waterLevel', { across: 1.5, lead: 2 }); // right in her way: she shoots past it
  close.to(28);
  assert.ok(close.flight().some(w => /fixed shot "waterLevel" pans \d+\.\d deg\/s \(max 40\)/.test(w.message)), JSON.stringify(close.flight()));
  close.done();
});

test('the orbit circles slowly, and under reduced motion it is the vista instead', () => {
  const { director, camera, to, at, done, flight } = setUp();
  at(132);
  camera.shot('orbit');
  const from = director.rig.position.clone().sub(route.pointAt(route.progressAt(132)));
  to(148.2);
  camera.stop();
  assert.deepEqual(flight(), [], 'within 1.2 m/s and 15 deg/s of her');
  done();

  const calm = setUp({ reduced: true });
  calm.at(132);
  calm.camera.shot('orbit');
  const start = calm.director.rig.position.clone();
  calm.to(136);
  assert.ok(calm.director.rig.position.distanceTo(start) < 1e-9, 'a fixed camera');
  calm.done();
  assert.ok(from.length() > 5);
});

// When each shot is used in the flight (spec 5, chapters/kafli4-flight.js), when to look, and the shot's options. A call shot is
// looked at as she passes its group: before that she is still coming, out of its still frame (the Flugmynd spec).
const rowOf = kind => CALL_SHOTS.find(row => row.shot === kind);
const FIRST_CALL = rowOf('call');
/** A call shot's options for camera.shot, and when she is the one it frames: her pass, or the ledge's call (the flyer leaves). */
const optionsOf = row => ({ ...row.options, callShot: row.id });
const framedAt = row => (row.shot === 'ledge' ? row.call : row.pass);
const WHEN = {
  chase: [20, 40], face: [83, 86], side: [47, 50], orbit: [134, 141],
  belowTakeOff: [3, 5.5], waterLevel: [25, 27.5], mosiBank: [57.5, 60],
  ...Object.fromEntries(['call', 'runAlong', 'ledge', 'herd'].map(kind => [kind, [rowOf(kind).from, framedAt(rowOf(kind)), optionsOf(rowOf(kind))]])),
  mosiRim: [96, 97.5], fallsSide: [110, 113], fallsTop: [113.4, 115.5], vista: [125, 128],
};

// ---- the call shots (the Flugmynd spec, 2026-11-15): a still camera down with a group, as she calls and sweeps past ------------
// Which beat each row of the owner's list lies in (spec: "The list").
const CALL_BEATS = { 'kall-edlur': 'C', 'kall-froskar': 'C', 'kall-fuglar': 'C', 'kall-hlaup': 'C', 'kall-sylla': 'D', 'kall-hjord': 'F' };
const beatOf = t => Object.entries(BEATS).filter(([name]) => name !== 'END').findLast(([, at]) => t >= at - 1e-9)[0];
const herAt = t => route.pointAt(route.progressAt(t));
/** A route group's middle as the call camera sees it: 0.3 m over the ground or the water, or in the crown (the birds). */
function middleOf(id) {
  const g = route.groups.find(x => x.id === id);
  const ground = Math.max(world.heightAt(g.at[0], g.at[2]), route.waterAt(g.at[0], g.at[2], 1) ?? -Infinity);
  return new THREE.Vector3(g.at[0], Math.max(ground + 0.3, g.at[1]), g.at[2]);
}
/** What a call shot is about: its group's middle, the ledge's nest, the herd's middle (1.5 m over the ground: a grazer's). */
function aboutOf(row) {
  if (row.shot === 'ledge') return new THREE.Vector3(...NESTS[row.nest].slice(0, 3));
  if (row.shot === 'herd') return new THREE.Vector3(row.at[0], world.heightAt(...row.at) + 1.5, row.at[1]);
  return middleOf(row.group);
}
const ON_THE_GROUND = new Set(['call', 'runAlong']); // the kinds that stand low on a bank, from CLEAR to 1.5 m over it

test('CALL_SHOTS rows are ordered, inside their beats and at least 2.5 s', () => {
  assert.deepEqual(CALL_SHOTS.map(row => [row.id, row.shot]), [
    ['kall-edlur', 'call'], ['kall-froskar', 'call'], ['kall-fuglar', 'call'], ['kall-hlaup', 'runAlong'], ['kall-sylla', 'ledge'], ['kall-hjord', 'herd'],
  ]);
  const stills = STILLS.map(([shot, from, to, options]) => ({ shot, from, to, options })).sort((a, b) => a.from - b.from);
  for (const row of CALL_SHOTS) {
    if (row.shot === 'ledge') {
      // the flyer leaves 3.5 s or more into it, and she comes under its nest as it ends (she passes the nest just after the cut)
      assert.ok(row.from < row.call && row.call < row.to && row.to <= row.pass, `${row.id}: ${row.from} < ${row.call} < ${row.to} ≤ ${row.pass}`);
      assert.ok(row.call - row.from >= 3.5 - 1e-9, `${row.id}: ${(row.call - row.from).toFixed(2)} s from the cut till the flyer leaves (at least 3.5)`);
      assert.ok(row.nest >= 0 && row.nest < NESTS.length, `${row.id}: a nest`);
    } else {
      // the herd's call is the big call, at the cut
      assert.ok(row.from <= row.call && row.call < row.pass && row.pass < row.to, `${row.id}: ${row.from} ≤ ${row.call} < ${row.pass} < ${row.to}`);
      assert.ok(row.pass - row.from >= 3.5 - 1e-9, `${row.id}: ${(row.pass - row.from).toFixed(2)} s from the cut to her pass (at least 3.5)`);
      assert.ok(row.to - row.pass >= 2 - 1e-9, `${row.id}: ${(row.to - row.pass).toFixed(2)} s after her pass (at least 2)`);
    }
    assert.ok(row.to - row.from >= FLIGHT_RULES.minShot, `${row.id}: ${(row.to - row.from).toFixed(2)} s long`);
    assert.equal(beatOf(row.from), CALL_BEATS[row.id], `${row.id} begins in ${beatOf(row.from)}`);
    assert.ok(row.to <= BEATS[String.fromCharCode(CALL_BEATS[row.id].charCodeAt(0) + 1)] + 1e-9, `${row.id} ends in its beat (${row.to})`);
    if (ON_THE_GROUND.has(row.shot)) {
      for (const id of [row.group, ...(row.also ?? []), ...Object.keys(row.early ?? {})]) assert.ok(route.groups.some(g => g.id === id), `${row.id}: a group named ${id}`);
    }
    if (row.shot === 'herd') assert.equal(row.call, 135, `${row.id}: the big call's second (kafli4-flight-play.js PLAY.bigCall)`);
    // its still: the plants keep out of its view (stillViews)
    assert.equal(stills.filter(s => s.options.callShot === row.id && s.shot === row.shot && s.from === row.from && s.to === row.to).length, 1, `${row.id} in STILLS`);
  }
  for (let i = 1; i < CALL_SHOTS.length; i++) assert.ok(CALL_SHOTS[i].from >= CALL_SHOTS[i - 1].to, `${CALL_SHOTS[i].id} after ${CALL_SHOTS[i - 1].id}`);
  // no still overlaps another, and between two of them the shot on her back (a chase, beside her) lasts 2.5 s, or none comes between
  assert.deepEqual(stills.filter(s => s.shot === 'bankShadow' || s.shot === 'gorgeHigh' || s.shot === 'waterLevel' && s.from > BEATS.C), [], 'the shots the call shots take the place of');
  for (let i = 1; i < stills.length; i++) {
    const gap = stills[i].from - stills[i - 1].to;
    assert.ok(Math.abs(gap) < 1e-9 || gap >= FLIGHT_RULES.minShot, `${stills[i - 1].shot} (to ${stills[i - 1].to}) then ${stills[i].shot} (from ${stills[i].from}): ${gap.toFixed(2)} s between`);
  }
  // in C, no call shot takes the time of Mosi's cameo
  const bank = stills.find(s => s.shot === 'mosiBank');
  for (const row of CALL_SHOTS) assert.ok(row.to <= bank.from || row.from >= bank.to, `${row.id} and Mosi's cameo`);
});

test('call shots frame what they are about and her at both sizes, and stand still (the run-along looks its one way)', () => {
  const head = flugedla.model.getObjectByName('Head');
  for (const row of CALL_SHOTS) {
    const { camera, director, to, at, done, flight } = setUp();
    at(row.from);
    camera.shot(row.shot, optionsOf(row));
    const position = director.rig.position.clone();
    const target = director.rig.target.clone();
    const middle = aboutOf(row);
    // the ledge's nest is in the frame as it begins
    if (row.shot === 'ledge') {
      for (const aspect of [1.6, 0.69]) {
        world.camera.aspect = aspect;
        world.camera.updateProjectionMatrix();
        director.apply();
        world.scene.updateMatrixWorld(true);
        const q = middle.clone().project(world.camera);
        assert.ok(q.z < 1 && Math.abs(q.x) <= 0.95 && Math.abs(q.y) <= 0.95, `${row.id} at ${aspect}: the nest at ${q.x.toFixed(2)}, ${q.y.toFixed(2)} as it begins`);
      }
      world.camera.aspect = 1.6;
      world.camera.updateProjectionMatrix();
    }
    const seen = framedAt(row);
    to(seen);
    for (const aspect of [1.6, 0.69]) {
      world.camera.aspect = aspect;
      world.camera.updateProjectionMatrix();
      director.apply();
      world.scene.updateMatrixWorld(true);
      for (const [who, p] of [['what it is about', middle], ['her', herAt(seen)], ['her head', head.getWorldPosition(new THREE.Vector3())]]) {
        const q = p.clone().project(world.camera);
        assert.ok(q.z < 1 && Math.abs(q.x) <= 0.95 && Math.abs(q.y) <= 0.95, `${row.id} at ${aspect}, ${seen} s: ${who} at ${q.x.toFixed(2)}, ${q.y.toFixed(2)}`);
      }
    }
    world.camera.aspect = 1.6;
    world.camera.updateProjectionMatrix();
    // no land between the camera and the group, nor between it and her from her call to a second after her pass
    const lands = (a, b) => {
      const d = a.distanceTo(b);
      for (let s = 0.5; s < d - 0.5; s += 0.25) {
        const p = a.clone().lerp(b, s / d);
        if (p.y < world.heightAt(p.x, p.z) + 0.1) return true;
      }
      return false;
    };
    assert.ok(!lands(position, middle), `${row.id}: land between the camera and what it is about`);
    for (let t = Math.min(row.call, seen); t <= Math.min(seen + 1, row.to); t += 0.25) assert.ok(!lands(position, herAt(t)), `${row.id}: land between the camera and her at ${t.toFixed(2)} s`);
    const way = target.clone().sub(position);
    to(row.to - 0.05);
    if (row.shot === 'runAlong') {
      assert.ok(director.rig.position.distanceTo(position) > 20, `${row.id}: the stand goes along with them (${director.rig.position.distanceTo(position).toFixed(1)} m)`);
      assert.ok(director.rig.target.clone().sub(director.rig.position).distanceTo(way) < 1e-6, `${row.id}: it looks the one way`);
    } else if (row.options.ease) {
      // the herd: a still camera whose aim comes slowly up toward her over its `ease` seconds (the fixed rule's pan: flight() below)
      assert.ok(director.rig.position.distanceTo(position) < 1e-9, `${row.id}: it stands still`);
      assert.ok(director.rig.target.y > target.y + 1, `${row.id}: its aim comes up (${target.y.toFixed(1)} to ${director.rig.target.y.toFixed(1)})`);
    } else assert.ok(director.rig.position.distanceTo(position) < 1e-9 && director.rig.target.distanceTo(target) < 1e-9, `${row.id}: a still frame`);
    assert.deepEqual(flight(), [], `${row.id} keeps the rules`);
    done();
  }
});

test('the run-along keeps the track rules: 7 m/s at most, its pan 40 deg/s, no roll, clear of her and of the ground', () => {
  const row = rowOf('runAlong');
  const { camera, director, to, at, done, flight } = setUp();
  at(row.from);
  camera.shot('runAlong', optionsOf(row));
  const start = director.rig.position.clone();
  const last = director.rig.position.clone();
  const lastWay = director.rig.target.clone().sub(director.rig.position).normalize();
  let fastest = 0;
  let turns = 0;
  let nearest = Infinity;
  to(row.to - 0.05, t => {
    director.apply();
    const p = director.rig.position;
    if (t < row.options.move - 1e-6) assert.ok(p.distanceTo(start) < 1e-9, `still till they run (${t.toFixed(2)} s)`);
    fastest = Math.max(fastest, p.distanceTo(last) / DT);
    const way = director.rig.target.clone().sub(p).normalize();
    turns = Math.max(turns, deg(way.angleTo(lastWay)) / DT);
    last.copy(p);
    lastWay.copy(way);
    assert.equal(camera.roll, 0);
    nearest = Math.min(nearest, p.distanceTo(herAt(t)));
    const over = p.y - Math.max(world.heightAt(p.x, p.z), route.waterAt(p.x, p.z, 1) ?? -Infinity);
    assert.ok(over >= CLEAR - 1e-6 && over <= 1.5, `${t.toFixed(2)} s: the stand ${over.toFixed(2)} m over the ground`);
  });
  assert.equal(FLIGHT_RULES.track.speed, 7);
  assert.equal(FLIGHT_RULES.track.pan, 40);
  assert.ok(fastest <= FLIGHT_RULES.track.speed && fastest > 3, `at most ${fastest.toFixed(2)} m/s`);
  assert.ok(turns <= FLIGHT_RULES.track.pan, `it turns ${turns.toFixed(1)} deg/s at most`);
  assert.ok(nearest > 3, `she passes ${nearest.toFixed(1)} m from it`);
  assert.deepEqual(flight(), []);
  camera.stop();
  done();
  // a stand too fast for its rule is linted
  const quick = setUp();
  quick.at(row.from);
  quick.camera.shot('runAlong', { ...optionsOf(row), move: row.to - 2 });
  quick.to(row.to - 0.05);
  assert.ok(quick.flight().some(w => /moving shot "runAlong" goes \d+\.\d\d m\/s \(max 7\)/.test(w.message)), JSON.stringify(quick.flight()));
  quick.done();
});

test('reduced motion: the run-along stands still, at its path\'s middle', () => {
  const row = rowOf('runAlong');
  const calm = setUp({ reduced: true });
  calm.at(row.from);
  calm.camera.shot('runAlong', optionsOf(row));
  const start = calm.director.rig.position.clone();
  calm.to(row.to - 0.05, () => assert.ok(calm.director.rig.position.distanceTo(start) < 1e-9, 'a still camera'));
  const [[ax, az], [bx, bz]] = row.options.path;
  assert.ok(Math.hypot(start.x - (ax + bx) / 2, start.z - (az + bz) / 2) < 0.5, `at ${start.x.toFixed(1)}, ${start.z.toFixed(1)}`);
  assert.deepEqual(calm.flight(), []);
  calm.done();
});

test('the orbit\'s last part: a shorter circle at its own pace, ending where the whole one ends', () => {
  const herd = rowOf('herd');
  const ends = seconds => {
    const { director, camera, to, at, done, flight } = setUp();
    const from = seconds === null ? 134 : BEATS.G - seconds;
    at(from);
    camera.shot('orbit', seconds === null ? {} : { seconds });
    const first = director.rig.position.clone().sub(herAt(from));
    to(BEATS.G - 0.05);
    const last = director.rig.position.clone().sub(herAt(BEATS.G - 0.05));
    camera.stop();
    const warnings = flight();
    done();
    return { first, last, warnings };
  };
  const whole = ends(null);
  const part = ends(BEATS.G - herd.to);
  assert.deepEqual(part.warnings, [], 'within 1.2 m/s and 15 deg/s of her');
  assert.ok(part.last.distanceTo(whole.last) < 0.3, `it ends where the whole one ends (${part.last.distanceTo(whole.last).toFixed(2)} m)`);
  assert.ok(part.first.distanceTo(whole.first) > 2, 'it begins part of the way round');
  // under reduced motion the circle is the still vista, and its last part the same still vista: where the whole one would stand (the
  // herd's shot cuts into it)
  const still = seconds => {
    const calm = setUp({ reduced: true });
    calm.at(seconds === null ? 134 : BEATS.G - seconds);
    calm.camera.shot('orbit', seconds === null ? {} : { seconds });
    const where = calm.director.rig.position.clone();
    calm.done();
    return where;
  };
  const calm = still(BEATS.G - herd.to);
  assert.ok(calm.distanceTo(still(null)) < 0.5, `reduced motion: the vista where the whole circle's stands (${calm.distanceTo(still(null)).toFixed(2)} m off)`);
});

test('call shots stand clear: from CLEAR to 1.5 m over the ground or the water down on a bank (CLEAR at least on the ledge), never inside her', () => {
  assert.equal(CLEAR, 1.2);
  const views = stillViews(route, { heightAt: world.heightAt });
  for (const row of CALL_SHOTS) {
    const own = views.filter(v => v.shot === row.shot && v.from === row.from);
    assert.ok(own.length >= 1, `${row.id}: a still view`);
    if (row.shot === 'runAlong') assert.ok(own.length >= Math.floor(row.to - row.from), `${row.id}: a view from each second of its stand's way (${own.length})`);
    for (const view of own) {
      if (ON_THE_GROUND.has(row.shot)) assert.equal(view.group, row.group, `${row.id}: the view knows its group`);
      const p = view.position;
      const over = p.y - Math.max(world.heightAt(p.x, p.z), route.waterAt(p.x, p.z, 1) ?? -Infinity);
      const most = row.shot === 'ledge' ? Infinity : 1.5;
      assert.ok(over >= CLEAR - 1e-9 && over <= most + 1e-9, `${row.id}: the camera ${over.toFixed(2)} m over the ground or the water`);
      // what it sees: her all through it, and what it is about
      assert.ok(view.looks.some(l => l.distanceTo(aboutOf(row)) < 1e-6), `${row.id}: what it is about is in its view`);
    }
    if (row.shot === 'runAlong') continue; // its stand moves: the track rules' test keeps her off it
    let nearest = Infinity;
    for (let t = row.from; t <= row.to; t += 0.05) nearest = Math.min(nearest, herAt(t).distanceTo(own[0].position));
    assert.ok(nearest > 3, `${row.id}: she passes ${nearest.toFixed(1)} m from the camera`);
  }
});

test('every named shot frames her and Egill at 16:10 and at an upright 0.625, and is never inside her', () => {
  const head = flugedla.model.getObjectByName('Head');
  const neck = flugedla.model.getObjectByName('Neck');
  const hips = flugedla.model.getObjectByName('Hips');
  const { camera, director, to, at, done } = setUp();
  assert.deepEqual([...camera.shots].sort(), Object.keys(WHEN).sort());
  for (const [name, [start, look, options = {}]] of Object.entries(WHEN)) {
    at(start);
    camera.shot(name, options);
    to(look);
    for (const aspect of [1.6, 0.625]) {
      world.camera.aspect = aspect;
      world.camera.updateProjectionMatrix();
      director.apply();
      world.scene.updateMatrixWorld(true);
      const where = p => { const q = p.clone().project(world.camera); return { x: q.x, v: (1 - q.y) / 2, z: q.z }; };
      const egillHead = where(egill.headPosition(new THREE.Vector3()));
      const herHead = where(head.getWorldPosition(new THREE.Vector3()));
      const body = where(flugedla.root.localToWorld(new THREE.Vector3(0.06, 2.6, 0)));
      for (const [who, p] of [['Egill\'s head', egillHead], ['her head', herHead], ['her body', body]]) {
        assert.ok(p.z < 1 && Math.abs(p.x) < 0.95 && p.v > 0.08 && p.v < 0.97, `${name} at ${aspect}: ${who} at x ${p.x.toFixed(2)}, v ${p.v.toFixed(2)}`);
      }
      for (const [who, p] of [['Egill\'s head', egillHead], ['her head', herHead]]) assert.ok(p.v < 0.7, `${name} at ${aspect}: ${who} in the bottom 30 % (v ${p.v.toFixed(2)})`);
    }
    world.camera.aspect = 1.6;
    world.camera.updateProjectionMatrix();
    const cam = world.camera.position;
    for (const [who, bone, least] of [['her head', head, 1.0], ['her neck', neck, 1.0], ['her body', hips, 1.5]]) {
      const d = cam.distanceTo(bone.getWorldPosition(new THREE.Vector3()));
      assert.ok(d > least, `${name}: the camera ${d.toFixed(2)} m from ${who}`);
    }
    assert.ok(cam.distanceTo(egill.headPosition(new THREE.Vector3())) > 0.8, `${name}: the camera in Egill's face`);
    assert.ok(cam.y > (world.heightAt?.(cam.x, cam.z) ?? -Infinity), `${name}: under the ground`);
  }
  done();
});

test('the shot over the lip looks away from the chapter sun as she comes up the last of the falls, so the rainbow shows, and the land never hides her', () => {
  const sun = sunDirection(pickLook('earlyAfternoon')).clone().normalize(); // chapters/flug.js's look
  const { camera, director, to, at, done } = setUp();
  at(113.4);
  camera.shot('fallsTop');
  const view = new THREE.Vector3();
  const body = new THREE.Vector3();
  const p = new THREE.Vector3();
  let frames = 0;
  to(116, t => {
    director.apply();
    world.camera.getWorldDirection(view);
    assert.equal(rainbowLevel(view, sun), 1, `the rainbow whole at ${t.toFixed(2)} s`);
    flugedla.root.localToWorld(body.set(0.06, 2.6, 0));
    const cam = world.camera.position;
    for (let k = 0.05; k < 0.97; k += 0.02) {
      p.lerpVectors(cam, body, k);
      assert.ok(world.heightAt(p.x, p.z) < p.y, `the land between the camera and her at ${t.toFixed(2)} s (${(k * 100).toFixed(0)} %)`);
    }
    frames++;
  });
  assert.ok(frames > 70);
  done();
});
