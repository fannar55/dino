// The animals' dances in chapter 5's music video (chapters/kafli5-dances.js, its floor in kafli5-stage.js): each is a pure function
// of the dance beat (kafli5-video.js), so nearly all of this is plain arithmetic on the pool's own seats over flat ground. The last
// tests give a dance to the life at the pool (world/ardalur/life.js) and to the scene's hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARTS, CALLS, TUNE, SLIP, JUMP, partAt, danceOf, stageMembers, audienceOf, createDances } from '../chapters/kafli5-dances.js';
import { RUN, EIGHT, eightPoint, stageLife, LOG } from '../chapters/kafli5-stage.js';
import { BENDS, danceBeatAt } from '../chapters/kafli5-video.js';
import { SONG } from '../chapters/kafli5-set.js';
import { CHOIR, GROUPS, WADE, POOL_LIFE } from '../chapters/kafli5-pool.js';
import { createRoute, FAR_POOL } from '../chapters/kafli4-route.js';
import { createLife } from '../world/ardalur/life.js';
import { createCrowds } from '../world/critters/crowd.js';

const SET = SONG.set;
const BEAT_SECONDS = 60 / SONG.bpm;
const FRAME = (1 / 30) / BEAT_SECONDS; // a frame of a tablet at 30 a second, in beats
const LEVEL = FAR_POOL.level;
const DEG = Math.PI / 180;
const part = id => PARTS.find(p => p.id === id);
const members = stageMembers();
const of = group => members.filter(m => m.group === group);
const around = (a, b) => ((b - a + 540) % 360 + 360) % 360 - 180;
/** Where a member is with its dance on it: [x, y, z], and how far that is from where it stands, seen from above. */
const placed = (m, d) => [m.x + d.dx, m.y + d.dy, m.z + d.dz];
const away = d => Math.hypot(d.dx, d.dz);
const fromMiddle = ([x, , z]) => Math.hypot(x - FAR_POOL.center[0], z - FAR_POOL.center[1]);
const angleOf = ([x, , z]) => ((Math.atan2(z - FAR_POOL.center[1], x - FAR_POOL.center[0]) / DEG) + 360) % 360;
/** Every frame of the set as the scene plays it: [{ setBeat, beat, frozen, rewinding }]. */
const frames = (() => {
  const list = [];
  for (let setBeat = 0; setBeat <= SET.endBeat + 5; setBeat += FRAME) list.push({ setBeat, ...danceBeatAt(setBeat) });
  return list;
})();

test('every part of the set has its dance, on the dance beat', () => {
  for (const section of SET.sections) {
    const at = danceBeatAt(section.startBeat + 1).beat;
    const id = { rewind: 'drop', redrop: 'drop' }[section.id] ?? section.id;
    assert.equal(partAt(at).id, id, `${section.id} at dance beat ${at}`);
  }
  PARTS.forEach((p, i) => { if (i) assert.equal(p.from, PARTS[i - 1].to, `${p.id} starts where ${PARTS[i - 1].id} ends`); });
  assert.equal(part('drop').to - part('drop').from, 16, 'the drop and its replay are one part of sixteen beats');
  assert.equal(part('freeze').from + 6, danceBeatAt(BENDS.freeze.from).beat, 'the freeze comes six beats into Stoppdans');
  assert.ok(GROUPS.every(group => CALLS[group].length > 50) && CALLS.beetles.length === 32 && CALLS.dragonflies.length === 3);
  assert.ok(TUNE.length >= 28 && TUNE.every(note => Number.isFinite(note.beat)));
});

test('a dance is a pure function of the beat: the same pose at the same beat, whatever was asked before', () => {
  const beats = [0.5, 70.3, 131.25, 155.5, 163.1, 181.7, 199.9, 210.25, 229, 250, 290.2, 299.4, 330, 349.99, 380.5, 395, 410, 422, 440.6, 466, 473];
  const first = beats.map(beat => members.map(m => danceOf(m, beat)));
  const again = [...beats].reverse().map(beat => members.map(m => danceOf(m, beat))).reverse();
  assert.deepEqual(again, first);
  for (const poses of first) for (const d of poses) {
    for (const key of ['dx', 'dy', 'dz', 'turn', 'pitch', 'roll', 'mix', ...[0, 1, 2].map(i => `squash.${i}`)]) {
      const v = key.startsWith('squash') ? d.squash[Number(key.at(-1))] : d[key];
      assert.ok(Number.isFinite(v), `${key} is ${v}`);
    }
    if (d.clips) assert.ok(Math.abs(d.clips.reduce((sum, [, , w]) => sum + w, 0) - 1) < 1e-9, 'a baked model\'s clips add up to 1');
  }
});

// How far a member may move in a frame (m) and turn (degrees), playing forward; the rewind spools back twice as fast.
const STEP = { grazers: [0.36, 12], turtles: [0.2, 30], frogs: [0.65, 45], lizards: [0.46, 30], flyers: [1.1, 16], beetles: [0.45, 12], dragonflies: [1.0, 360] };
test('nothing jumps from one frame to the next through the whole set, the rewind and the freeze too', () => {
  for (const m of members) {
    const [far, turned] = STEP[m.group];
    let before = null;
    for (const f of frames) {
      const d = danceOf(m, f.beat, { setBeat: f.setBeat });
      const now = { at: placed(m, { dx: d.dx * d.mix, dy: d.dy * d.mix, dz: d.dz * d.mix }), turn: d.turn * d.mix, f };
      if (before && !(before.f.frozen && !f.frozen)) { // but on "Dansa!", where everything slams back in
        const speed = f.rewinding || before.f.rewinding ? 2 : 1;
        const moved = Math.hypot(...now.at.map((v, i) => v - before.at[i]));
        assert.ok(moved <= far * speed, `${m.group} ${m.k} moves ${moved.toFixed(2)} m in the frame at set beat ${f.setBeat.toFixed(2)}`);
        const turn = Math.abs(around(before.turn, now.turn));
        assert.ok(turn <= turned * speed, `${m.group} ${m.k} turns ${turn.toFixed(0)} degrees in the frame at set beat ${f.setBeat.toFixed(2)}`);
      }
      before = now;
    }
  }
});

test('in the rewind the picture is the drop played backwards, and after it the drop again', () => {
  const m = of('frogs')[1];
  const back = danceOf(m, danceBeatAt(BENDS.rewind.from + 1).beat);
  assert.deepEqual(back, danceOf(m, BENDS.rewind.from - 2), 'a beat into the spool is two beats back in the drop');
  assert.deepEqual(danceOf(m, danceBeatAt(BENDS.rewind.to + 3).beat), danceOf(m, part('drop').from + 3));
});

test('in the freeze nothing moves but one turtle, which tips off its shell\'s rim and pulls its head in', () => {
  const held = danceBeatAt(BENDS.freeze.from).beat;
  for (const m of members) {
    const still = danceOf(m, held, { setBeat: BENDS.freeze.from });
    for (const setBeat of [BENDS.freeze.from + 0.5, SLIP.at + 0.5, SLIP.at + 3, BENDS.freeze.to - 0.01]) {
      const d = danceOf(m, danceBeatAt(setBeat).beat, { setBeat });
      if (m.group === 'turtles' && m.k === SLIP.turtle && setBeat > SLIP.at) assert.notDeepEqual(d, still, 'the one that moves');
      else assert.deepEqual(d, still, `${m.group} ${m.k} stands as it stood at set beat ${setBeat}`);
    }
  }
  const turtle = of('turtles')[SLIP.turtle];
  const up = danceOf(turtle, held, { setBeat: SLIP.at - 0.01 });
  assert.ok(Math.abs(up.roll) > 1.2, `frozen up on its rim (${up.roll.toFixed(2)} rad)`);
  const down = danceOf(turtle, held, { setBeat: SLIP.at + 3 });
  assert.ok(Math.abs(down.roll) < 0.05 && down.dy < 0.05 && down.morphs.hide > 0.9 && away(down) > 0.2, 'flat, slid aside, its head in');
  // what was frozen: everyone caught in the middle of a move
  const pose = m => danceOf(m, held);
  assert.ok(of('grazers').every(m => pose(m).dy > 0.4 && Math.abs(pose(m).roll) > 0.1), 'the grazers up on one side');
  assert.ok(of('frogs').filter(m => pose(m).dy > 0.4).length >= 2, 'two frogs in the air');
  assert.ok(of('flyers').every(m => pose(m).dy > 1), 'the flyers off the ground');
  assert.ok(of('lizards').some(m => pose(m).dy > 0.5) && of('lizards').some(m => pose(m).dy < 0.1), 'every other lizard mid-hop');
});

test('they come out of their idle life as the set starts, and stand as they stood when it is over', () => {
  for (const m of members) {
    assert.equal(danceOf(m, 0).mix, 0);
    assert.equal(danceOf(m, 2).mix, 1);
    for (const beat of [SET.endBeat + 4, SET.endBeat + 5, 480]) assert.equal(danceOf(m, beat).mix, 0, `${m.group} at ${beat}`);
    if (m.group === 'dragonflies') continue;
    const last = danceOf(m, SET.endBeat + 3.2); // the last jump has landed
    assert.ok(away(last) < 0.05 && Math.abs(last.dy) < 0.1 && Math.abs(around(0, last.turn)) < 2, `${m.group} ${m.k} is on its place before its idle life comes back`);
  }
});

// The parts in which a group leaves its place: the line, the eight, the rings of the drop, the parade.
const TRAVELS = { grazers: ['carnival'], lizards: ['lizards', 'drop', 'carnival', 'lastchorus'], flyers: ['flyers', 'drop', 'carnival', 'lastchorus'], frogs: [], turtles: [] };
test('a tap on a group\'s place is a tap on the group: they keep inside its circle but for the line, the flights and the parade', () => {
  for (const group of GROUPS) {
    const spot = CHOIR[group];
    for (const p of PARTS) {
      const travels = TRAVELS[group].includes(p.id);
      for (let beat = p.from + 1.2; beat < Math.min(p.to, 480); beat += 0.37) {
        if (p.id === 'freeze' && beat > p.from + 6) break;
        if (travels) continue;
        for (const m of of(group)) {
          const at = placed(m, danceOf(m, beat));
          const off = Math.hypot(at[0] - spot.at[0], at[2] - spot.at[1]);
          assert.ok(off <= spot.radius + 0.6, `${group} ${m.k} is ${off.toFixed(1)} m from its place in ${p.id} at ${beat.toFixed(1)}`);
        }
      }
      // and home a beat into the next part
      if (travels && p.to < 480) for (const m of of(group)) {
        const d = danceOf(m, p.to + 1);
        assert.ok(away(d) < 0.8, `${group} ${m.k} is ${away(d).toFixed(2)} m from its seat a beat after ${p.id}`);
      }
    }
  }
});

test('the wave: as the forest answers her welcome the groups hop one after another, low to high', () => {
  const from = part('welcome').from + 8;
  const top = group => { // when the group is highest in the two beats after the roar
    let best = [0, 0];
    for (let beat = from - 0.5; beat < from + 3.5; beat += 0.05) { const dy = danceOf(of(group)[0], beat).dy; if (dy > best[0]) best = [dy, beat]; }
    return best;
  };
  const tops = GROUPS.map(top);
  tops.forEach(([dy], i) => assert.ok(dy > 0.25 * JUMP[GROUPS[i]], `${GROUPS[i]} hops ${dy.toFixed(2)} m`));
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i][1] > tops[i - 1][1] + 0.3, `${GROUPS[i]} after ${GROUPS[i - 1]}`);
});

test('the warm-up: they are down on beats two and four, and low and still in the build\'s silence; then everyone is up at once', () => {
  const { from, to } = part('warmup');
  for (const m of members.filter(m => GROUPS.includes(m.group))) {
    const on = danceOf(m, from + 17), off = danceOf(m, from + 18); // beat 2 of a bar, and beat 3
    assert.ok(on.squash[1] < off.squash[1] - 0.05, `${m.group} is down on the clap`);
    const a = danceOf(m, to - 0.5), b = danceOf(m, to - 0.25);
    assert.ok(a.squash[1] < 0.8 && a.dy < 0.02, `${m.group} is low in the silence`);
    assert.ok(Math.abs(a.squash[1] - b.squash[1]) < 0.01 && Math.hypot(a.dx - b.dx, a.dy - b.dy, a.dz - b.dz) < 0.01, `${m.group} is still in the silence`);
    assert.ok(danceOf(m, to + 0.65).dy > 0.5 * JUMP[m.group], `${m.group} is up as the dance floor opens`);
  }
});

test('the grazers stomp together: down on every whole beat, up between, left then right', () => {
  const { from, to } = part('grazers');
  const three = of('grazers');
  const side = (m, d) => -Math.sin(m.heading * DEG) * d.dx + Math.cos(m.heading * DEG) * d.dz; // to its right
  let last = 0;
  for (let beat = from + 1; beat < to; beat++) {
    const down = three.map(m => danceOf(m, beat)), up = three.map(m => danceOf(m, beat + 0.68));
    assert.ok(down.every(d => d.dy < 0.03), `all down on beat ${beat}`);
    assert.ok(up.every(d => d.dy > 0.3), `all up before beat ${beat + 1}`);
    assert.ok(down.every(d => Math.abs(d.dy - down[0].dy) < 1e-9 && Math.abs(d.roll - down[0].roll) < 1e-9), 'together');
    const s = side(three[0], down[0]);
    assert.ok(Math.abs(s) > 0.4 && s * last <= 0, `the other foot on beat ${beat} (${s.toFixed(2)} m)`);
    last = s;
  }
});

test('the turtles: a very slow sway with the head out and in, then over onto their shells and spinning, and back on their feet', () => {
  const { from, to } = part('turtles');
  for (const m of of('turtles')) {
    // slow: a sway takes four beats, and it stays on its feet
    const heads = [];
    for (let beat = from + 1; beat < from + 7; beat += 0.25) {
      const d = danceOf(m, beat);
      assert.ok(Math.abs(d.roll) < 0.4 && away(d) < 0.5, 'on its feet');
      heads.push(d.morphs.stretch); // the owner's turtle: its neck
    }
    assert.ok(Math.max(...heads) > 0.9 && Math.min(...heads) < 0.1, 'the head right out and right in');
    const flips = heads.slice(1).filter((h, i) => (h - heads[i]) * (heads[i] - (heads[i - 1] ?? heads[i])) < 0).length;
    assert.ok(flips <= 3, `slowly (${flips} turns of the head in six beats)`);
    // fast: on its shell from a beat after "Og hratt!", going round
    let round = 0, before = null;
    for (let beat = from + 9.5; beat <= to - 2; beat += FRAME) {
      const d = danceOf(m, beat);
      assert.ok(Math.cos(d.roll) < -0.95 && d.dy > 0.5, `on its shell at ${beat.toFixed(1)}`);
      if (before !== null) round += around(before, d.turn);
      before = d.turn;
    }
    assert.ok(Math.abs(round) > 360 * 3.5, `it spins (${(Math.abs(round) / 360).toFixed(1)} times round in 4.5 beats)`);
    const after = danceOf(m, to);
    assert.ok(Math.abs(after.roll) < 0.3 && Math.abs(around(0, after.turn)) < 1 && after.dy < 0.1, 'on its feet, facing as it did, when the part ends');
  }
});

test('the frogs leap from pad to pad as they croak, two at a time, and everyone is home when the part ends', () => {
  const { from, to } = part('frogs');
  const frogs = of('frogs');
  const pads = frogs.map(m => [m.x, m.z]);
  const onPad = at => pads.findIndex(([x, z]) => Math.hypot(at[0] - x, at[2] - z) < 0.01);
  const leapt = frogs.map(() => 0);
  let inAir = frogs.map(() => false);
  for (let beat = from; beat <= to; beat += FRAME / 2) {
    const poses = frogs.map(m => danceOf(m, beat));
    const sat = new Set();
    poses.forEach((d, k) => {
      const pad = onPad(placed(frogs[k], d));
      const flying = pad < 0;
      if (flying) assert.ok(d.dy > 0 && d.morphs.leap > 0, 'between two pads it is in the air, its legs out');
      else { assert.ok(!sat.has(pad), `two frogs on pad ${pad} at ${beat.toFixed(2)}`); sat.add(pad); }
      if (flying && !inAir[k]) {
        leapt[k]++;
        assert.ok(CALLS.frogs.some(call => Math.abs(call - beat) < FRAME) || beat > to - 2.5, `a leap at ${beat.toFixed(2)} starts on a croak`);
      }
      inAir[k] = flying;
    });
    assert.ok(poses.filter((d, k) => onPad(placed(frogs[k], d)) < 0).length <= 5);
  }
  assert.ok(leapt.every(n => n >= 3), `every frog leaps (${leapt})`);
  frogs.forEach((m, k) => assert.equal(onPad(placed(m, danceOf(m, to))), k, `frog ${k} is on its own pad at the end`));
  // the owner's frog: down into its legs just before a leap and as it lands, legs out in the air, its throat going on the pad
  const first = frogs.map(m => [m, danceOf(m, from + 0.3)]).find(([, d]) => d.dy > 0.3)[0]; // one that leaps on the first croak
  const second = CALLS.frogs.find(call => call > from + 1 && danceOf(first, call + 0.3).dy > 0.3); // and its next leap
  assert.ok(danceOf(first, second - 0.06).morphs.crouch > 0.8 && danceOf(first, second - 0.06).dy < 0.02, 'crouched on its pad before it leaps');
  assert.ok(danceOf(first, second + 0.3).morphs.leap > 0.8 && danceOf(first, second + 0.3).morphs.crouch < 0.2, 'legs out in the air');
  assert.ok(danceOf(first, second + 0.63).morphs.crouch > 0.5, 'and down into its legs as it lands');
  const sitting = frogs.find(m => Array.from({ length: 9 }, (_, i) => danceOf(m, from + 4 + i / 8)).every(d => d.dy < 0.15 && away(d) < 4));
  if (sitting) assert.ok(Math.max(...Array.from({ length: 9 }, (_, i) => danceOf(sitting, from + 4 + i / 8).morphs.breathe)) > 0.5, 'its throat goes as it sits');
});

test('each model gets what it has: the owner\'s turtle its neck and a look aside, the game\'s own turtle its one head morph', () => {
  const turtles = of('turtles');
  const { from } = part('turtles');
  const old = turtles.map(m => ({ ...m, neck: false }));
  for (const beat of [from + 2, from + 3.3, from + 11.25, part('break').from + 5]) {
    turtles.forEach((m, k) => {
      const mine = danceOf(m, beat).morphs, its = danceOf(old[k], beat).morphs;
      assert.deepEqual(Object.keys(mine).sort(), ['hide', 'look', 'stretch']);
      assert.deepEqual(Object.keys(its).sort(), ['hide', 'look']);
      assert.equal(its.look, mine.stretch, 'the head out is the neck stretched');
      assert.equal(its.hide, mine.hide);
    });
  }
  for (const m of turtles) assert.ok(Math.max(...Array.from({ length: 24 }, (_, i) => danceOf(m, from + 1 + i / 4).morphs.look)) > 0.6, 'a look aside in the slow sway');
  for (const m of of('frogs')) assert.deepEqual(Object.keys(danceOf(m, 70).morphs).sort(), ['breathe', 'crouch', 'leap']);
  for (const m of of('beetles')) assert.deepEqual(Object.keys(danceOf(m, 70).morphs).sort(), ['kickA', 'kickB']);
  // on the stone wherever the dance has it: a turtle that goes aside on a stone that falls away goes down with it
  const onStone = { ...turtles[1], floor: (x, z) => turtles[1].y - 0.5 * Math.hypot(x - turtles[1].x, z - turtles[1].z) };
  const flat = danceOf(turtles[1], from + 12), sloped = danceOf(onStone, from + 12);
  assert.ok(away(flat) > 0.4 && sloped.dy < flat.dy - 0.15, `it lies ${(flat.dy - sloped.dy).toFixed(2)} m lower where the stone is lower`);
});

test('the lizards run in a line along the water\'s edge toward the log, stop and shake their tails, and are home by the twelfth beat and a half', () => {
  const { from } = part('lizards');
  const lizards = of('lizards');
  // at the far end: all on the lane, one behind another, the leader by the frogs
  const far = lizards.map(m => placed(m, danceOf(m, from + 6.6)));
  for (const at of far) assert.ok(Math.abs(fromMiddle(at) - RUN.distance) <= RUN.zig + 0.05, `on the lane (${fromMiddle(at).toFixed(1)} m out)`);
  const angles = far.map(angleOf).sort((a, b) => a - b);
  assert.ok(angles[0] < 183 && angles[0] > 178, `the leader is by the frogs (${angles[0].toFixed(0)} degrees)`);
  for (let i = 1; i < angles.length; i++) assert.ok((angles[i] - angles[i - 1]) * DEG * RUN.distance > 1.5, 'a body\'s length apart');
  // they stand still there but for the tail: three shakes round the second beat
  const still = lizards.map(m => [danceOf(m, from + 6.55), danceOf(m, from + 6.95)]);
  for (const [a, b] of still) assert.ok(Math.hypot(a.dx - b.dx, a.dz - b.dz) < 0.05, 'stopped');
  let wags = 0, was = 0;
  for (let beat = from + 6.5; beat < from + 7.05; beat += FRAME / 2) {
    const turn = danceOf(lizards[0], beat).turn - danceOf(lizards[0], from + 6.45).turn;
    if (Math.sign(turn) && Math.sign(turn) !== was) { wags++; was = Math.sign(turn); }
  }
  assert.ok(wags >= 3, `the tail shakes (${wags} swings)`);
  // darts: it moves fast, then not at all
  const speed = beat => Math.hypot(...['dx', 'dz'].map(k => danceOf(lizards[0], beat + 0.05)[k] - danceOf(lizards[0], beat - 0.05)[k])) / 0.1;
  assert.ok(speed(from + 3.75) > 2 && speed(from + 4.8) < 0.3, 'a dart, and a stop');
  for (const m of lizards) assert.ok(away(danceOf(m, from + 14)) < 0.05, `lizard ${m.k} is home at the fourteenth beat`);
  for (const m of lizards) assert.ok(away(danceOf(m, from + 12.6)) < 1.6, `lizard ${m.k} is nearly home at twelve and a half (the camera is on their place)`);
});

test('the flyers fly a figure of eight over the pool: through its middle, up to the high tip, down past the low one, and home', () => {
  const { from, to } = part('flyers');
  const flyers = of('flyers');
  const her = [WADE.at[0], LEVEL + 3, WADE.at[1]];
  for (const m of flyers) {
    let middle = 0, wasNear = false, high = 0, low = Infinity, dive = Infinity, nearHer = Infinity;
    for (let beat = from; beat <= to; beat += FRAME / 2) {
      const d = danceOf(m, beat);
      const at = placed(m, d);
      const near = fromMiddle(at) < 2 && at[1] > LEVEL + 3;
      if (near && !wasNear) middle++;
      wasNear = near;
      high = Math.max(high, at[1] - LEVEL);
      if (fromMiddle(at) < 20) low = Math.min(low, at[1] - LEVEL);
      dive = Math.min(dive, Math.hypot(...eightPoint(Math.PI / 2).map((v, i) => v - at[i])));
      nearHer = Math.min(nearHer, Math.hypot(...her.map((v, i) => v - at[i])));
      if (beat > from + 2 && beat < to - 2) assert.ok(d.clips.find(([clip]) => clip === 'perch')[2] < 0.5, 'its wings out in the air');
    }
    assert.ok(middle >= 2, `flyer ${m.k} crosses the pool's middle twice (${middle})`);
    assert.ok(high > 6.5 && low > 1.5 && low < EIGHT.low + 1.2, `high ${high.toFixed(1)} m, low ${low.toFixed(1)} m over the water`);
    assert.ok(dive < 1.5, `it dives past the low tip (${dive.toFixed(1)} m from it)`);
    assert.ok(nearHer > 5, `never near Slóeðla (${nearHer.toFixed(1)} m)`);
    assert.ok(away(danceOf(m, to)) < 0.3, 'home when the part ends');
  }
  // the dive: the first of them passes the low tip on the eighth beat
  let best = [Infinity, 0];
  for (let beat = from; beat <= to; beat += 0.05) {
    const far = Math.hypot(...eightPoint(Math.PI / 2).map((v, i) => v - placed(flyers[0], danceOf(flyers[0], beat))[i]));
    if (far < best[0]) best = [far, beat - from];
  }
  assert.ok(Math.abs(best[1] - 8) < 0.15, `the dive is on the part's eighth beat, a call of theirs (${best[1].toFixed(2)})`);
  assert.ok(CALLS.flyers.includes(from + 8));
});

test('the beetles drum: on every hit of the percussion the beetle whose turn it is hops, and only it', () => {
  const { from } = part('beetles');
  const beetles = of('beetles');
  assert.equal(beetles.length, 6);
  const hits = CALLS.beetles;
  assert.deepEqual(hits, Array.from({ length: 32 }, (_, i) => from + i / 2));
  const turns = new Set();
  hits.forEach((hit, i) => {
    const up = beetles.filter(m => danceOf(m, hit + 0.2).dy > 0.2).map(m => m.k);
    assert.ok(up.length >= 1, `a beetle hops on hit ${i}`);
    assert.ok(beetles.every(m => up.includes(m.k) || danceOf(m, hit + 0.2).dy < 0.03), 'the others sit');
    turns.add(up.join());
    assert.ok(beetles.every(m => danceOf(m, hit - 0.02).dy < 0.03), 'down again before the next hit');
  });
  assert.ok(turns.size >= 8, 'a run down the log, the two ends, everyone');
});

test('the dragonflies hover by the log, dart to Slóeðla on their calls, circle her through her horn, and go home in the build', () => {
  const flies = of('dragonflies');
  const her = [WADE.at[0], LEVEL + 3.2, WADE.at[1]];
  const toHer = (m, beat) => Math.hypot(...her.map((v, i) => v - placed(m, danceOf(m, beat))[i]));
  flies.forEach((m, k) => {
    assert.ok(away(danceOf(m, CALLS.dragonflies[k] - 0.1)) < 0.8, 'hovering where it lives until its call');
    assert.ok(toHer(m, CALLS.dragonflies[k] + 3.2) < 4, `at her crest three beats after its call (${toHer(m, CALLS.dragonflies[k] + 3.2).toFixed(1)} m)`);
    for (let beat = part('break').from; beat < part('break').to; beat += 1.3) assert.ok(toHer(m, beat) < 4, 'round her through her horn');
    assert.ok(away(danceOf(m, part('rise').from + 12)) < 0.8, 'home in the build');
    assert.deepEqual(danceOf(m, 100).wings[1], 1);
  });
});

test('the countdown: the group that answers each number pops up, on "Einn!" everyone is down low, and on "Nú!" everyone jumps', () => {
  const counts = SET.cues.filter(cue => cue.kind === 'count');
  const answers = ['grazers', 'turtles', 'frogs', 'lizards'];
  counts.slice(0, 4).forEach((count, i) => {
    const group = answers[i];
    assert.ok(CALLS[group].includes(count.beat + 1), `${group} answers ${count.n}`);
    for (const m of members.filter(m => GROUPS.includes(m.group))) {
      const dy = danceOf(m, count.beat + 1.5).dy;
      if (m.group === group) assert.ok(dy > 0.6 * JUMP[group], `${group} pops up on ${count.n} (${dy.toFixed(2)} m)`);
      else assert.ok(dy < 0.3 * JUMP[m.group], `${m.group} waits on ${count.n}`);
    }
  });
  const one = counts.at(-1).beat;
  for (const m of members.filter(m => GROUPS.includes(m.group))) {
    const held = danceOf(m, one + 1.4);
    assert.ok(held.squash[1] < 0.8 && held.dy < 0.03, `${m.group} is down low on "Einn!"`);
    const up = danceOf(m, one + 2 + 0.85);
    assert.ok(up.dy > 0.9 * JUMP[m.group], `${m.group} jumps ${up.dy.toFixed(2)} m on "Nú!"`);
  }
});

test('the parade: the grazers in single file behind the stone, the lizards along the edge, the flyers over them; "Hopp!"; and home', () => {
  const { from, to } = part('carnival');
  const at = (m, beat) => placed(m, danceOf(m, from + beat));
  const grazers = of('grazers');
  const far = grazers.map(m => at(m, 15.5));
  grazers.forEach((m, k) => assert.ok(angleOf(far[k]) > angleOf([m.x, 0, m.z]) + 8, `grazer ${k} has gone toward the reed`));
  // two lanes: the two on the outer one are well over a body apart, the one on the inner lane is between them, and all the way
  // none is in another (their middles never nearer than 2.5 m: they are 7.5 m long and some 2 m wide)
  const [inner, behind, ahead] = far;
  assert.ok((angleOf(ahead) - angleOf(behind)) * DEG * 36 > 15 && angleOf(inner) > angleOf(behind) + 5 && angleOf(inner) < angleOf(ahead) - 5, 'a file in two lanes');
  assert.ok(fromMiddle(ahead) - fromMiddle(inner) > 2.4);
  for (let beat = 0; beat <= 32; beat += 0.25) {
    const now = grazers.map(m => at(m, beat));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(now[i][0] - now[j][0], now[i][2] - now[j][2]) > 2.5, `grazers ${i} and ${j} at part beat ${beat}`);
  }
  for (const p of far) assert.ok(fromMiddle(p) > 33, 'behind the turtles\' stone');
  // facing along the bank on the way out, the other way on the way back
  const facing = (m, beat) => m.heading + danceOf(m, from + beat).turn;
  for (const m of grazers) {
    const tangent = angleOf([m.x, 0, m.z]) + 90;
    assert.ok(Math.abs(around(tangent, facing(m, 8))) < 25, 'out: toward the reed');
    assert.ok(Math.abs(around(tangent + 180, facing(m, 23))) < 25, 'back: the other way');
  }
  for (const m of of('lizards')) assert.ok(away(danceOf(m, from + 15.5)) > 3, 'the lizards have gone along the edge');
  for (const m of of('flyers')) assert.ok(at(m, 12)[1] > LEVEL + 5, 'the flyers are over them');
  for (const m of of('turtles')) assert.ok(away(danceOf(m, from + 12)) < 0.6, 'the turtles keep to their stone');
  const hopp = SET.lines.filter(line => line.id.startsWith('hopp')).map(line => line.beat);
  assert.equal(hopp.length, 2);
  for (const beat of hopp) for (const m of members.filter(m => ['grazers', 'turtles', 'lizards'].includes(m.group))) {
    const lift = danceOf(m, beat + 0.6).dy - danceOf(m, beat - 0.7).dy;
    assert.ok(lift > 0.3 * JUMP[m.group], `${m.group} hops on "Hopp!" (${lift.toFixed(2)} m)`);
  }
  for (const m of members.filter(m => GROUPS.includes(m.group))) {
    const d = danceOf(m, to - 0.5);
    assert.ok(away(d) < 0.6 && Math.abs(around(0, d.turn)) < 25, `${m.group} ${m.k} is home, facing the pool, before the next part`);
  }
});

test('"Egill, segðu já!": they wait turned toward him, and jump when the forest answers, higher the second time', () => {
  const { from } = part('crowd');
  const roars = SET.cues.filter(cue => cue.kind === 'roar' && cue.beat >= from && cue.beat < from + 16).map(cue => cue.beat);
  assert.equal(roars.length, 2);
  for (const m of members.filter(m => GROUPS.includes(m.group))) {
    const waiting = danceOf(m, from + 6);
    const toEgill = Math.atan2(FAR_POOL.bank[1] - m.z, FAR_POOL.bank[0] - m.x) / DEG;
    assert.ok(Math.abs(around(m.heading + waiting.turn, toEgill)) < Math.abs(around(m.heading, toEgill)) - 5 || Math.abs(around(m.heading, toEgill)) < 12, `${m.group} turns toward Egill`);
    assert.ok(waiting.dy < 0.15 * JUMP[m.group], 'waiting');
    const [first, second] = roars.map(beat => danceOf(m, beat + 0.75).dy);
    assert.ok(first > 0.6 * JUMP[m.group] && second > first, `${m.group} jumps ${first.toFixed(2)} then ${second.toFixed(2)} m`);
  }
});

test('the two endings: a pose held as if it were over; then on each stab a group strikes its pose, everyone jumps on the last hit', () => {
  const fake = part('fakeend');
  for (const m of members.filter(m => GROUPS.includes(m.group))) {
    const a = danceOf(m, fake.from + 2), b = danceOf(m, fake.from + 4.2);
    assert.deepEqual(a, b, `${m.group} holds its pose`);
    assert.ok(a.dy > 0.1 && Math.abs(a.pitch) > 0.1, 'and it is a pose');
  }
  const end = part('end');
  const stabs = ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'];
  stabs.forEach((group, i) => {
    assert.ok(CALLS[group].includes(end.from + i), `${group} sings on stab ${i}`);
    for (const m of of(group)) {
      assert.ok(Math.abs(danceOf(m, end.from + i - 0.3).pitch) < 0.05, `${group} waits for its stab`);
      assert.ok(Math.abs(danceOf(m, end.from + i + 0.6).pitch) > 0.1, `${group} strikes its pose on its stab`);
      assert.deepEqual(danceOf(m, end.from + 6), danceOf(m, end.from + 10), 'and holds it through her good night');
    }
  });
  const last = SET.cues.find(cue => cue.kind === 'end').beat;
  for (const m of members.filter(m => GROUPS.includes(m.group))) assert.ok(danceOf(m, last + 0.8).dy > 0.9 * JUMP[m.group], `${m.group} jumps on the last hit`);
});

test('the last chorus is every dance at once: stomping, spinning, leaping, the line and the eight', () => {
  const { from } = part('lastchorus');
  assert.ok(of('grazers').every(m => danceOf(m, from + 9.68).dy > 0.35 && danceOf(m, from + 10).dy < 0.03), 'the grazers stomp');
  assert.ok(of('turtles').some(m => Math.cos(danceOf(m, from + 9).roll) < -0.9), 'the turtles are on their shells');
  let leaps = 0;
  for (let beat = from; beat < from + 30; beat += 0.25) if (of('frogs').some(m => danceOf(m, beat).dy > 0.6)) leaps++;
  assert.ok(leaps > 12, `the frogs leap (${leaps} quarter beats with one in the air)`);
  assert.ok(of('lizards').every(m => Math.abs(fromMiddle(placed(m, danceOf(m, from + 6.6))) - RUN.distance) < 1), 'the lizards are out on their lane');
  assert.ok(of('flyers').every(m => placed(m, danceOf(m, from + 12))[1] > LEVEL + 2 && placed(m, danceOf(m, from + 24))[1] > LEVEL + 2), 'the flyers are in the air');
  assert.ok(of('beetles').some(m => danceOf(m, from + 4.2).dy > 0.2), 'the beetles drum');
});

test('less motion: half the size, nobody leaves its place, nobody turns over, nothing fast', () => {
  for (const m of members) {
    let before = null;
    for (const f of frames) {
      if (f.frozen) { before = null; continue; }
      const d = danceOf(m, f.beat, { reduced: true });
      const full = JUMP[m.group] || 1;
      assert.ok(away(d) <= 0.9, `${m.group} ${m.k} is ${away(d).toFixed(2)} m from its place at ${f.beat.toFixed(1)}`);
      assert.ok(d.dy <= 0.62 * full + 0.3 && Math.abs(d.roll) < 0.6, `${m.group} ${m.k}: ${d.dy.toFixed(2)} m up, rolled ${d.roll.toFixed(2)} at ${f.beat.toFixed(1)}`);
      if (before && !f.rewinding) assert.ok(Math.abs(around(before.turn, d.turn)) < 14, `${m.group} turns slowly at ${f.beat.toFixed(1)}`);
      before = f.rewinding ? null : d;
    }
  }
});

test('the dance floor: a log on the bank between the turtles and the frogs, beetles along it, dragonflies over the shallows', () => {
  const stage = stageLife();
  assert.ok(LOG.angle > CHOIR.turtles.angle + 6 && LOG.angle < CHOIR.frogs.angle - 6 && LOG.distance > FAR_POOL.radius + 2);
  assert.equal(stage.beetles.length, 6);
  for (const b of stage.beetles) assert.ok(Math.hypot(b.at[0] - LOG.at[0], b.at[1] - LOG.at[1]) < 2.5, 'on the log');
  for (const d of stage.dragonflies) assert.ok(fromMiddle([d.at[0], 0, d.at[1]]) < FAR_POOL.radius - 0.5, 'over the water');
  for (const c of stage.clear) assert.ok(c.over <= 0.5, 'the lanes keep the grass');
  // the lanes are clear of the seats of those who do not use them, of the stone and of her reed
  for (const c of stage.clear) assert.ok(Math.hypot(c.x - FAR_POOL.farReed[0], c.z - FAR_POOL.farReed[1]) > 7 + c.r - 0.5, 'her reed stands');
});

// --- with the life at the pool -------------------------------------------------------------------

const route = createRoute();
function pool() {
  const world = { scene: new THREE.Scene(), clock: { time: 0 }, flightTime: null, camera: null };
  const life = createLife(world, route, { heightAt: () => LEVEL + 1, choir: POOL_LIFE });
  life.arrive();
  const step = (t = world.clock.time + 1 / 30) => { world.clock.time = t; life.update(1 / 30, t); };
  return { world, life, step };
}

test('life.js takes a dance: the thing is at its place with the dance on it, and where it stood again without', () => {
  const { life, step } = pool();
  const [frog, other] = life.pool.frogs;
  const [turtle] = life.pool.turtles;
  step();
  const home = frog.position.clone();
  frog.dance = { dx: 1, dy: 0.5, dz: -2, turn: 30, pitch: 0.2, roll: 0.3, squash: [1.1, 0.8, 1.1], morphs: { leap: 0.7 } };
  turtle.dance = { roll: Math.PI, dy: 0.6, morphs: { look: 1 } };
  step();
  assert.deepEqual(frog.position.toArray().map(v => +v.toFixed(6)), [home.x + 1, home.y + 0.5, home.z - 2].map(v => +v.toFixed(6)));
  assert.equal(frog.heading, frog.gather.heading + 30);
  assert.deepEqual([frog.pitch, frog.roll, frog.squash, frog.morphs.leap], [0.2, 0.3, [1.1, 0.8, 1.1], 0.7]);
  assert.deepEqual([turtle.roll, turtle.morphs.look, Math.abs(turtle.morphs.hide)], [Math.PI, 1, 0]);
  assert.ok(other.position.distanceTo(other.gather.at) < 1e-9, 'the others are where they sat');
  // while it dances its idle life does not show: a dance that stands still is still
  const held = JSON.stringify([frog.position, frog.squash, turtle.morphs]);
  step(50);
  assert.equal(JSON.stringify([frog.position, frog.squash, turtle.morphs]), held);
  // a part of a dance: mixed with its idle life
  frog.dance = { dx: 1, mix: 0.25 };
  step();
  assert.ok(Math.abs(frog.position.x - (home.x + 0.25)) < 1e-9);
  frog.dance = null;
  turtle.dance = null;
  step();
  assert.ok(frog.position.distanceTo(home) < 1e-9 && frog.roll === 0 && turtle.roll === 0 && frog.heading === frog.gather.heading);
});

test('the pool has its dance floor: six beetles on the log and three dragonflies, drawn only near the camera', () => {
  const { life, world, step } = pool();
  assert.equal(life.pool.beetles.length, 6);
  assert.equal(life.pool.dragonflies.length, 3);
  assert.ok(life.props.some(p => p.name === 'log'));
  const drawn = () => life.crowds.placed().filter(p => p.kind === 'beetle').length;
  world.camera = new THREE.PerspectiveCamera();
  world.camera.position.set(LOG.at[0] + 6, LEVEL + 2, LOG.at[1]);
  world.camera.updateMatrixWorld();
  step();
  assert.equal(drawn(), 6, 'the beetles are drawn from six metres');
  world.camera.position.set(LOG.at[0] + 60, LEVEL + 5, LOG.at[1]);
  world.camera.updateMatrixWorld();
  step();
  assert.equal(drawn(), 0, 'and not from across the pool');
  const none = createLife({ scene: new THREE.Scene(), clock: { time: 0 } }, route, { heightAt: () => LEVEL + 1, choir: { ...POOL_LIFE, stage: null } });
  assert.equal(none.pool.beetles.length + none.pool.dragonflies.length, 0, 'a pool with no dance floor has none');
});

test('the scene\'s dances: every dancer gets its pose each frame, a tap\'s hop comes on top, and the end puts everyone back', () => {
  const { life, world, step } = pool();
  const c = {
    world: { forest: { life }, heightAt: () => LEVEL + 1, THREE },
    members: { grazers: [], turtles: life.pool.turtles, frogs: life.pool.frogs, lizards: [], flyers: [] },
    reduced: false,
  };
  step();
  const dances = createDances(c);
  // the pool's turtles, frogs, beetles and dragonflies, and those that came and are not in the choir (here: all of them)
  const audience = dances.dancers.filter(({ m }) => m.audience);
  assert.equal(dances.dancers.length - audience.length, 3 + 5 + 6 + 3);
  assert.equal(audience.length, life.arrivals.length);
  dances.update({ beat: 163.2, setBeat: 163.2, frozen: false, rewinding: false, section: null });
  step();
  assert.ok(life.pool.frogs.some(b => b.position.distanceTo(b.gather.at) > 0.3), 'a frog is between its pads');
  assert.ok(life.pool.frogs.every(b => b.dance), 'each has its dance');
  // a child's tap hops a group on top of its dance, whatever cues come
  const turtle = life.pool.turtles[0];
  const danced = turtle.position.y;
  life.hop(turtle, { height: 0.5, seconds: 0.4 });
  dances.cue({ kind: 'call', group: 'turtles', beat: 164 });
  dances.update({ beat: 163.2, setBeat: 163.2, frozen: false, rewinding: false, section: null });
  step(world.clock.time + 0.2);
  assert.ok(turtle.position.y > danced + 0.4, 'a tap\'s hop is on top of the dance');
  // one the camera does not see gets its pose every fourth frame, one it sees every frame
  const [seen, unseen] = life.pool.frogs;
  seen.shown = true;
  unseen.shown = false;
  let fresh = [0, 0];
  for (let i = 0; i < 12; i++) {
    const before = [seen.dance, unseen.dance];
    dances.update({ beat: 164 + i / 30, setBeat: 164 + i / 30, frozen: false, rewinding: false, section: null });
    if (seen.dance !== before[0]) fresh[0]++;
    if (unseen.dance !== before[1]) fresh[1]++;
  }
  assert.deepEqual(fresh, [12, 3]);
  step();
  assert.equal(seen.shown, true, 'life.js says what it drew (no camera here: everything)');
  dances.dispose();
  step(world.clock.time + 5); // the tap's hop is over
  for (const b of [...life.pool.frogs, ...life.pool.turtles, ...life.pool.beetles]) assert.ok(b.dance === null && b.position.distanceTo(b.gather.at) < 1e-9);
});

test('the crowds draw a roll: a critter rolled a quarter turn has its top to its right, one rolled half a turn is on its back', () => {
  const crowds = createCrowds({ scene: new THREE.Scene() });
  crowds.reserve('turtle', 3);
  crowds.begin(null);
  const at = new THREE.Vector3(10, 2, -4);
  crowds.place('turtle', at, 0, 2, { roll: 0 });
  crowds.place('turtle', at, 0, 2, { roll: Math.PI / 2 });
  crowds.place('turtle', at, 90, 2, { roll: Math.PI, pitch: 0 });
  crowds.end();
  const mesh = crowds.meshes[0];
  const top = i => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return new THREE.Vector3(0, 1, 0).transformDirection(m).toArray().map(v => Math.round(v * 1e6) / 1e6 + 0); };
  assert.deepEqual(top(0), [0, 1, 0]);
  assert.deepEqual(top(1), [0, 0, 1], 'heading 0 faces +X: its right is +Z');
  assert.deepEqual(top(2), [0, -1, 0]);
  crowds.dispose();
});

test('the rest of those that came dance too, each where it stands: no line, no flight, no parade, but every jump', () => {
  const spots = FAR_POOL.gather.map(([x, z]) => ({ x, y: LEVEL + 1, z, heading: 200 }));
  const crowd = ['grazers', 'lizards', 'flyers', 'turtles'].flatMap(group => spots.slice(0, 9).map((_, k) => audienceOf(group, k, spots)));
  for (const m of crowd) {
    let before = null, most = 0;
    for (const f of frames) {
      const d = danceOf(m, f.beat, { setBeat: f.setBeat });
      assert.ok(away(d) <= 1, `${m.group} ${m.k} of the audience is ${away(d).toFixed(2)} m from its place at ${f.beat.toFixed(1)}`);
      assert.ok(d.dy < JUMP[m.group] * 1.2 + 0.6);
      if (before && !f.frozen && !before.f.frozen) {
        const speed = f.rewinding || before.f.rewinding ? 2 : 1;
        assert.ok(Math.hypot(d.dx - before.d.dx, d.dy - before.d.dy, d.dz - before.d.dz) * d.mix <= STEP[m.group][0] * speed, `${m.group} of the audience jumps at ${f.setBeat.toFixed(2)}`);
      }
      most = Math.max(most, d.dy);
      before = { d, f };
    }
    assert.ok(most > 0.9 * JUMP[m.group], 'it jumps with everyone');
    const floor = Array.from({ length: 16 }, (_, i) => danceOf(m, part('groove').from + 9 + i / 8).dy);
    assert.ok(Math.max(...floor) - Math.min(...floor) > 0.05, 'it bobs on the dance floor');
    assert.deepEqual(danceOf(m, danceBeatAt(BENDS.freeze.from + 4).beat, { setBeat: BENDS.freeze.from + 4 }), danceOf(m, danceBeatAt(BENDS.freeze.from).beat, { setBeat: BENDS.freeze.from }), 'and stands still in the freeze');
  }
});
