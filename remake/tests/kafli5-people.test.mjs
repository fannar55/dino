// The people in the music video (chapter 5, scene 6): the score (chapters/kafli5-people-score.js: what Egill, Mosi, Flugeðla and
// Slóeðla do at each beat, pure numbers) and the score laid on the real models (chapters/kafli5-people.js, and her dance in
// chapters/kafli5-sloedla.js), played through the whole set with the rewind and Stoppdans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONG } from '../chapters/kafli5-set.js';
import { BENDS, danceBeatAt } from '../chapters/kafli5-video.js';
import { FAR_POOL } from '../chapters/kafli4-route.js';
import { CHOIR, WADE, headingTo } from '../chapters/kafli5-pool.js';
import {
  BEAT, scoreBeat, clockAt, energy, egillAt, mosiAt, flugedlaAt, sloedlaAt, JUMPS, EGILL_JUMPS, STOMPS, SHOUTS, FLIGHTS, DECKS, HER_TURN, HER_TURNS,
} from '../chapters/kafli5-people-score.js';

const SET = SONG.set;
const LEVEL = FAR_POOL.level;
const OVER = SET.endBeat + 5; // the set's last hit and its ring (kafli5.js SET_TAIL: 2.4 s)
const WHO = { egill: egillAt, mosi: mosiAt, flugedla: flugedlaAt, sloedla: sloedlaAt };
const part = id => SET.sections.find(section => section.id === id);
const at = (who, setBeat, options) => WHO[who](clockAt(setBeat), options);

/** Every number in a pose, by its path ('arms.right.up', 'at.1'). */
function numbers(pose, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(pose)) {
    if (typeof value === 'number') out[prefix + key] = value;
    else if (value && typeof value === 'object') numbers(value, `${prefix}${key}.`, out);
  }
  return out;
}
/** The set's beats a frame apart at `fps`, from 0 to its ring's end. */
function* frames(fps = 60) {
  const step = 1 / fps / BEAT;
  for (let b = 0; b <= OVER; b += step) yield b;
}
const angle = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

test('the score beat: the set\'s beat, but the dance beat and the rewind\'s 12 from the drop\'s second coming to "Dansa!"', () => {
  for (const setBeat of [0, 100, 295.9, 296, 300, 303.9, 304, 306, 307.9, 308, 320, 340, 361.9, 362, 368, 371.9, 372, 400, 472]) {
    const clock = clockAt(setBeat);
    assert.ok(Math.abs(clock.beat - danceBeatAt(setBeat).beat) < 1e-9, `the clock at ${setBeat} is the video's`);
    const b = scoreBeat(clock);
    if (setBeat < BENDS.rewind.from || setBeat >= BENDS.freeze.to) assert.equal(b, setBeat);
    else if (setBeat < BENDS.rewind.to) assert.ok(Math.abs(b - (304 - (setBeat - 304) * 2)) < 1e-9, `the rewind spools the score back (${setBeat}: ${b})`);
    else if (setBeat < BENDS.freeze.from) assert.ok(Math.abs(b - setBeat) < 1e-9, `after the rewind a move at the set's beat ${setBeat} is danced on it (${b})`);
    else assert.ok(Math.abs(b - BENDS.freeze.from) < 1e-9, `Stoppdans stands at the beat of "Stopp!" (${b})`);
  }
});

test('a pose is a function of the clock alone: the same clock, the same pose, in any order', () => {
  const beats = [3, 33.9, 64.2, 131.3, 240, 270, 297.3, 305.1, 310, 345.6, 365, 380.2, 408, 425, 440.4, 468, 473];
  for (const [who, fn] of Object.entries(WHO)) {
    const first = beats.map(setBeat => JSON.stringify(fn(clockAt(setBeat))));
    const again = [...beats].reverse().map(setBeat => JSON.stringify(fn(clockAt(setBeat)))).reverse();
    assert.deepEqual(again, first, who);
    for (const pose of first) assert.ok(!/null|NaN/.test(pose.replace(/"blink":(true|false)/, '')), `${who}: every number is a number (${pose})`);
  }
});

test('everyone stands as they were found when the set starts and when its last hit has rung', () => {
  for (const setBeat of [0, OVER - 0.3, OVER]) {
    const egill = at('egill', setBeat);
    assert.deepEqual([egill.lift, egill.yaw, egill.roll, egill.lean, egill.hop.weight, egill.wave.weight, egill.looking], [0, 0, 0, 0, 0, 0, 0], `Egill at ${setBeat}`);
    assert.equal(egill.spin % 360, 0, 'his spins are whole turns');
    assert.ok(Object.values(numbers(egill.arms)).every(v => v === 0), `Egill's arms at ${setBeat}`);
    const mosi = at('mosi', setBeat);
    assert.ok(['side', 'lift', 'yaw', 'roll', 'rear', 'nod', 'tail', 'looking', 'feet.fl', 'feet.fr', 'feet.bl', 'feet.br'].every(k => Math.abs(numbers(mosi)[k]) < 1e-9), `Mosi at ${setBeat}: ${JSON.stringify(mosi)}`);
    const flugedla = at('flugedla', setBeat);
    assert.deepEqual([flugedla.at[0], flugedla.at[2], flugedla.heading, flugedla.pitch, flugedla.bank, flugedla.air], [...DECKS.at, DECKS.home, 0, 0, 0], `Flugeðla at ${setBeat}`);
    assert.ok([flugedla.lift, flugedla.spread.left, flugedla.spread.right, flugedla.raise.left, flugedla.raise.right, flugedla.bow, flugedla.looking].every(v => Math.abs(v) < 1e-9), `Flugeðla's wings at ${setBeat}`);
    assert.ok(Object.values(flugedla.clips).every(clip => clip.weight === 0), `Flugeðla's clips at ${setBeat}`);
    const her = at('sloedla', setBeat);
    assert.ok(['lift', 'side', 'yaw', 'lean', 'nod', 'turn', 'tilt', 'tail'].every(k => Math.abs(her[k]) < 1e-9), `Slóeðla at ${setBeat}: ${JSON.stringify(her)}`);
  }
});

// What may change in a sixtieth of a second: more is a pop, not a move. A clip's time counts only while the clip shows.
const STEP = {
  default: 0.25, lift: 0.1, side: 0.05, yaw: 8, roll: 4, lean: 4, rear: 3, nod: 4, tail: 6, spin: 11, heading: 16, pitch: 12, bank: 16, bow: 4, turn: 4, tilt: 3,
  'at.0': 0.7, 'at.1': 0.7, 'at.2': 0.7, 'raise.left': 11, 'raise.right': 11, 'look.0': 3, 'look.1': 3, 'look.2': 3, clock: 0.05,
};
const LOOPS = { 'wave.time': 2.4, 'clips.fly.time': 1.4, 'clips.happy.time': 2.4 };
function pops(who, { fps = 60, skip = () => false } = {}) {
  const found = [];
  let last = null;
  for (const setBeat of frames(fps)) {
    const pose = numbers(WHO[who](clockAt(setBeat)));
    if (last && !skip(setBeat, last.setBeat)) {
      for (const [key, value] of Object.entries(pose)) {
        const was = last.pose[key];
        if (key.endsWith('.time')) {
          const weight = key.replace('.time', '.weight');
          if (Math.min(pose[weight], last.pose[weight]) < 0.02) continue;
          let moved = Math.abs(value - was);
          if (LOOPS[key]) moved = Math.min(moved, LOOPS[key] - moved);
          if (moved > 0.06 * (rewinding(setBeat) ? 2.2 : 1)) found.push(`${who} ${key} at ${setBeat.toFixed(2)}: ${was.toFixed(3)} to ${value.toFixed(3)} s`);
          continue;
        }
        const limit = STEP[key] ?? STEP[key.split('.').at(-1)] ?? STEP.default;
        const moved = ['heading', 'bank', 'spin'].includes(key) ? angle(value, was) : Math.abs(value - was);
        if (moved > limit * (60 / fps) * (rewinding(setBeat) ? 2.2 : 1)) found.push(`${who} ${key} at ${setBeat.toFixed(2)}: ${was.toFixed(3)} to ${value.toFixed(3)}`);
      }
    }
    last = { setBeat, pose };
  }
  return found;
}
const rewinding = setBeat => setBeat >= BENDS.rewind.from && setBeat < BENDS.rewind.to + 0.05;
// the one frame the clock snaps in: "Dansa!", when the dance beat leaps from where it froze to the set's
const snap = (now, before) => before < BENDS.freeze.to && now >= BENDS.freeze.to;

test('nothing pops from one frame to the next, through the rewind and its seam; only "Dansa!" slams', () => {
  for (const who of Object.keys(WHO)) assert.deepEqual(pops(who, { skip: snap }).slice(0, 6), [], who);
});

test('the rewind spools the drop back, and the drop comes again as it came', () => {
  for (const [who, fn] of Object.entries(WHO)) {
    // the rewind's four beats run the first drop's eight backwards
    assert.deepEqual(fn(clockAt(306)), fn({ beat: 300, setBeat: 300 }), `${who}: halfway through the rewind is the drop's fourth beat`);
    // where the rewind ends is where the drop began, and the drop's second coming starts from there
    const [end, again] = [numbers(fn(clockAt(307.999))), numbers(fn(clockAt(308)))];
    for (const key of ['lift', 'side', 'at.0', 'at.1', 'at.2', 'nod', 'rear', 'hop.time', 'heading', 'pitch', 'look.0', 'look.2']) {
      if (key in end) assert.ok(Math.abs(end[key] - again[key]) < (['nod', 'rear', 'heading', 'pitch'].includes(key) ? 1.5 : 0.05), `${who} ${key}: ${end[key]} at the rewind's end, ${again[key]} as the drop comes again`);
    }
  }
});

test('Stoppdans: everyone holds the pose "Stopp!" caught them in, and Egill is caught in the air', () => {
  for (const [who, fn] of Object.entries(WHO)) {
    const held = JSON.stringify(fn(clockAt(BENDS.freeze.from)));
    for (let setBeat = BENDS.freeze.from; setBeat < BENDS.freeze.to; setBeat += 0.37) assert.equal(JSON.stringify(fn(clockAt(setBeat))), held, `${who} at ${setBeat}`);
  }
  const egill = at('egill', BENDS.freeze.from + 3);
  assert.ok(egill.hop.weight > 0.9 && egill.hop.time > 0.5 && egill.hop.time < 0.8 && egill.lift > 0.1, `Egill hangs in the air (${JSON.stringify(egill.hop)}, ${egill.lift.toFixed(2)} m)`);
});

test('Egill: he bounces on the beat, jumps where the song jumps, and his hands answer Flugeðla', () => {
  // down on the beat, in the air between two beats (the dance floor)
  assert.ok(at('egill', 76).lift < 0.005 && at('egill', 76.5).lift > 0.05, 'the bounce');
  assert.ok(Math.sign(at('egill', 76.5).yaw) === -Math.sign(at('egill', 77.5).yaw), 'a twist one way, then the other');
  // every jump of the song: bent before it, off the ground on its beat, highest at the drop
  for (const jump of JUMPS) {
    const [before, on, up] = [at('egill', jump - 0.3), at('egill', jump), at('egill', jump + 0.6)];
    // (the drop's second coming and "Dansa!" come out of the rewind and the freeze: no bending down before them)
    if (jump !== BENDS.rewind.to && jump !== BENDS.freeze.to) assert.ok(before.hop.weight > 0.9 && before.hop.time < 0.42 && before.lift === 0, `bent down before ${jump}`);
    assert.ok(Math.abs(on.hop.time - 0.42) < 0.02, `off the ground on ${jump} (${on.hop.time.toFixed(2)} s into the clip)`);
    assert.ok(up.lift > 0.12, `in the air after ${jump} (${up.lift.toFixed(2)} m over the clip's own)`);
  }
  const highest = Math.max(...EGILL_JUMPS.map(([, more]) => more));
  assert.equal(EGILL_JUMPS.find(([beat]) => beat === part('drop').startBeat)[1], highest, 'the drop is his biggest jump');
  for (const [k, jump] of EGILL_JUMPS.entries()) {
    for (const other of EGILL_JUMPS.slice(k + 1)) assert.ok(Math.abs(other[0] - jump[0]) >= 3, `the jumps at ${jump[0]} and ${other[0]} do not run into each other`);
  }
  // "Egill! Ertu tilbúinn?": a jump and a wave, looking at her
  assert.ok(at('egill', 34).hop.weight > 0.9 && at('egill', 37).wave.weight > 0.9, 'he jumps and waves');
  // "Klappið með!": his hands meet on the band's claps
  assert.ok(at('egill', 45).arms.right.clap > 0.9 && at('egill', 46).arms.right.open > 0.9 && at('egill', 46).arms.right.clap < 0.05, 'he claps');
  // "Hendur upp, Egill!": both up while his close shot holds (268 to 272), and through the build
  for (const setBeat of [268, 270, 272, 280, 290]) {
    const { arms } = at('egill', setBeat);
    assert.ok(arms.right.up > 0.95 && arms.left.up > 0.95, `hands up at ${setBeat}`);
  }
  assert.ok(at('egill', 262).arms.right.up === 0 && at('egill', 300).arms.right.up === 0, 'and not before or after');
  // "Egill, segðu já!": hands at his mouth in the two gaps (he does not speak: the gap is the child's), the second bigger
  const [first, second] = SHOUTS.map(([from, to]) => at('egill', (from + to) / 2));
  assert.ok(first.arms.right.cup > 0.75 && first.arms.left.cup > 0.75 && first.lean > 8, `the first shout (${JSON.stringify(first.arms.right)})`);
  assert.ok(second.arms.right.cup > first.arms.right.cup && second.lean > first.lean, 'the second is bigger');
  assert.ok(at('egill', 416.6).lift > 0.2, 'and he jumps as the forest answers (416)');
});

test('Mosi: a slow sway from foot to foot, a nod on the backbeat, a stomp with the grazers, a little rear on the drops', () => {
  // a bar a sway: to his right, then to his left, the light side's feet off the ground
  const [right, left] = [at('mosi', 73), at('mosi', 75)];
  assert.ok(right.roll > 2 && right.side > 0.15 && right.feet.fl > 0.1 && right.feet.fr === 0, `to his right (${JSON.stringify(right.feet)})`);
  assert.ok(left.roll < -2 && left.side < -0.15 && left.feet.fr > 0.1 && left.feet.fl === 0, 'to his left');
  assert.ok(at('mosi', 73).nod < -10 && at('mosi', 74).nod > -4, 'his head is down on the backbeat and up after');
  // slow and big: nothing of his sways faster than a bar
  for (const stomp of STOMPS) {
    const foot = STOMPS.indexOf(stomp) % 2 ? 'fl' : 'fr';
    assert.ok(at('mosi', stomp - 0.3).feet[foot] > 0.4, `a forefoot high before ${stomp}`);
    assert.ok(at('mosi', stomp).feet[foot] < 0.12 && at('mosi', stomp + 0.12).nod < at('mosi', stomp - 0.5).nod, `and down on ${stomp}`);
  }
  for (const jump of JUMPS) assert.ok(at('mosi', jump + 0.9).rear > 6 && at('mosi', jump + 2.2).rear === 0, `a rear at ${jump}`);
  for (const setBeat of frames(20)) {
    const pose = at('mosi', setBeat);
    assert.ok(pose.rear >= 0 && pose.rear <= 9 && Math.abs(pose.roll) < 6 && Math.abs(pose.side) < 0.3, `within himself at ${setBeat.toFixed(1)}`);
    assert.ok(Object.values(pose.feet).every(lift => lift >= 0 && lift < 0.8), `his feet at ${setBeat.toFixed(1)}`);
  }
  assert.ok(Math.abs(at('mosi', 244).roll) < 0.3 && Math.abs(at('mosi', 244).nod) < 1, 'he stands and listens to her horn');
});

test('Flugeðla: she faces her dance floor, her wings go up on "Vængina upp!" and stay up, she bows at the end', () => {
  for (const setBeat of [16, 20, 23.9, 264, 268, 424, 428, 465, 471.9]) {
    const pose = at('flugedla', setBeat);
    assert.ok(angle(pose.heading, DECKS.heading) < 20 && pose.air < 0.05 && Math.hypot(pose.at[0] - DECKS.at[0], pose.at[2] - DECKS.at[1]) < 0.9, `at her decks at ${setBeat}, where her shot holds on her`);
  }
  assert.ok(at('flugedla', 18).spread.left > 0.95 && at('flugedla', 18).spread.right > 0.95, 'her wings are spread for the welcome');
  assert.deepEqual(at('flugedla', 100.5).spread, { left: 0, right: 0 }, 'and folded where she stands and bobs');
  for (const setBeat of [266, 268, 276, 284]) {
    const pose = at('flugedla', setBeat);
    assert.ok(pose.spread.left > 0.95 && pose.spread.right > 0.95 && pose.raise.left > 35 && pose.raise.right > 35, `wings up at ${setBeat} (${pose.raise.left.toFixed(0)} degrees)`);
  }
  assert.ok(at('flugedla', 260).raise.left < 10, 'and not before');
  // she beats the time on the water with the band's wing beats
  const wings = SET.cues.filter(event => event.kind === 'wings').map(event => event.beat);
  for (const beat of wings.filter(b => b >= 128 && b < 144)) {
    assert.ok(at('flugedla', beat).raise.left < -40 && at('flugedla', beat).spread.left > 0.8 && at('flugedla', beat - 0.45).raise.left > 10, `her wings lift and come down on the water at ${beat}`);
  }
  // the ending that is not one: still, then a wing flicks on "Einu sinni enn!"
  const flick = at('flugedla', 425);
  assert.ok(Math.abs(at('flugedla', 423).lift) < 0.01 && flick.raise.left > 25 && flick.spread.left > 0.95 && flick.spread.right < 0.05 && flick.blink, 'still, and one wing flicks');
  // "Egill, segðu já!": the wing on his side out to him, the other folded
  const point = at('flugedla', 406);
  assert.ok(point.spread.right > 0.95 && point.spread.left < 0.05, 'a wing out to Egill');
  // "Takk fyrir djammið!": she bows
  assert.ok(at('flugedla', 469.5).bow > 20 && at('flugedla', 469.5).spread.left > 0.9, `she bows (${at('flugedla', 469.5).bow.toFixed(0)} degrees)`);
});

test('Flugeðla flies: a round over the pool for her welcome, straight up on "Nú!", and up again spinning when the drop comes back', () => {
  const up = pose => pose.at[1] - LEVEL;
  const from = (pose, [x, z]) => Math.hypot(pose.at[0] - FAR_POOL.center[0] - x, pose.at[2] - FAR_POOL.center[1] - z);
  // the welcome: off at 24 (her shot holds on her till then), over the pool, down again before 34
  assert.ok(at('flugedla', 24).air < 0.1 && at('flugedla', 26).air === 1, 'she takes off on the cut');
  let far = 0;
  for (let b = 24; b <= 33; b += 0.1) {
    const pose = at('flugedla', b);
    far = Math.max(far, Math.hypot(pose.at[0] - DECKS.at[0], pose.at[2] - DECKS.at[1]));
    assert.ok(up(pose) < 5 && Math.hypot(pose.at[0] - FAR_POOL.center[0], pose.at[2] - FAR_POOL.center[1]) < FAR_POOL.radius + 2, `over the pool at ${b.toFixed(1)}`);
    assert.ok(Math.abs(pose.bank) <= 50 && Math.abs(pose.pitch) <= 78, `her turn at ${b.toFixed(1)}`);
  }
  assert.ok(far > 25, `a round right across the pool (${far.toFixed(1)} m from her decks)`);
  assert.ok(at('flugedla', 34).air === 0 && at('flugedla', 33.4).spread.left > 0.9, 'she lands with her wings spread');
  assert.ok(at('flugedla', 38).clips.land.weight === 0 && at('flugedla', 38).spread.left < 0.05, 'and folds them');
  // the drop: over the middle on "Nú!", low, then straight up
  const [low, high] = [at('flugedla', 296), at('flugedla', 299.5)];
  assert.ok(up(low) + 2.6 < 1.6 && up(high) > 10, `from ${(up(low) + 2.6).toFixed(1)} m over the water (her body) to ${up(high).toFixed(1)} m`);
  assert.ok(from(high, [low.at[0] - FAR_POOL.center[0], low.at[2] - FAR_POOL.center[1]]) < 3.6, 'straight up');
  assert.ok(at('flugedla', 297.5).pitch > 60, `her nose up (${at('flugedla', 297.5).pitch.toFixed(0)} degrees)`);
  // again: the same climb, and a whole turn about herself in it
  const [again, spun] = [at('flugedla', 308), at('flugedla', 312)];
  assert.ok(Math.hypot(again.at[0] - low.at[0], again.at[1] - low.at[1], again.at[2] - low.at[2]) < 1e-6 && Math.abs(again.pitch - low.pitch) < 6 && angle(again.heading, low.heading) < 6, 'the drop again starts where the drop did');
  let over = 0;
  for (let b = 308.6; b < 311.2; b += 0.05) over = Math.max(over, angle(at('flugedla', b).bank, 0));
  assert.ok(over > 150 && angle(spun.bank, 0) < 50, `a whole spin about herself (${over.toFixed(0)} degrees over at the most)`);
  // home again for "Öll saman!", and on her feet for the rest of the set
  assert.ok(at('flugedla', 323).air === 0 && Math.hypot(at('flugedla', 323).at[0] - DECKS.at[0], at('flugedla', 323).at[2] - DECKS.at[1]) < 0.05, 'home');
  for (const flight of FLIGHTS) assert.ok(flight.keys.every((key, k) => k === 0 || key[0] > flight.keys[k - 1][0]), 'a flight\'s keys in time');
  for (let b = 324; b <= OVER; b += 0.5) assert.equal(at('flugedla', b).air, 0, `on her feet at ${b}`);
});

test('Slóeðla: she sways more as the set grows, turns to the group whose part it is, stands tall for her horn', () => {
  const swing = (from, to) => { let most = 0; for (let b = from; b < to; b += 0.05) most = Math.max(most, Math.abs(at('sloedla', b).side)); return most; };
  const [arrival, groove, last] = [swing(8, 16), swing(70, 90), swing(436, 441)];
  assert.ok(arrival < groove && groove < last && last > 0.18, `her sway grows (${arrival.toFixed(2)}, ${groove.toFixed(2)}, ${last.toFixed(2)} m)`);
  // each group's part: she has turned to it by its second bar (her body and her head between them), and holds it to the part's end
  for (const group of ['grazers', 'turtles', 'frogs', 'lizards']) {
    const bearing = headingTo(WADE.at, CHOIR[group].at);
    for (const beat of [part(group).startBeat + 4, part(group).startBeat + 13]) {
      const pose = at('sloedla', beat);
      const off = angle(WADE.heading + pose.yaw + pose.turn, bearing);
      assert.ok(off < 22 && Math.abs(pose.turn) <= HER_TURN.head + 1e-9 && Math.abs(pose.yaw) <= HER_TURN.most + 8, `she faces the ${group} at ${beat} (${off.toFixed(0)} degrees off)`);
    }
  }
  // she stands as her own shots found her while they hold on her: the way she waded out
  for (const beat of [112, 119, 224, 232, 240, 254, 340, 347, 434, 442, 450]) {
    const pose = at('sloedla', beat);
    assert.ok(Math.abs(pose.yaw) < 7 && Math.abs(pose.turn) < 10, `facing Egill's bank at ${beat} (${pose.yaw.toFixed(1)}, ${pose.turn.toFixed(1)})`);
  }
  assert.ok(HER_TURNS.every((key, k) => k === 0 || key[0] > HER_TURNS[k - 1][0]), 'her turns in time');
  // the quiet part is hers: tall and still
  for (let b = 236; b < 262; b += 0.5) {
    const pose = at('sloedla', b);
    assert.ok(pose.lift > 0.1 && pose.nod > 5 && Math.abs(pose.side) < 0.01 && Math.abs(pose.tilt) < 0.5, `tall and still at ${b}`);
  }
  // the jumps: her head comes up with everyone's
  for (const jump of JUMPS) assert.ok(at('sloedla', jump + 1.9).nod > at('sloedla', jump - 2).nod + 6, `her head up at ${jump}`);
  // her horn's answers in the last chorus: she stands to blow, and dances between them
  const horns = SET.cues.filter(event => event.kind === 'horn' && event.beat >= 428 && event.beat < 460).map(event => event.beat);
  for (const horn of horns) assert.ok(Math.abs(at('sloedla', horn).side) < 0.08, `she stands to blow at ${horn}`);
});

// What her dance may move her crest in a frame of the chapter's test (a thirtieth of a second), at the worst: sideways by her
// root's sway, her body's turn (her crest 2 m ahead of it), her head's turn and its tilt (her crest about 1.8 m from where her neck
// bends); up and down by her lift, her body's lean (4.3 m up from her feet) and her nod.
const RAD = Math.PI / 180;
const crestMove = (a, b) => Math.hypot(
  Math.abs(a.side - b.side) + (Math.abs(a.yaw - b.yaw) * 2 + Math.abs(a.tilt - b.tilt) * 1.8 + Math.abs(a.turn - b.turn)) * RAD,
  Math.abs(a.lift - b.lift) + (Math.abs(a.lean - b.lean) * 4.3 + Math.abs(a.nod - b.nod) * 1.8) * RAD,
);

test('Slóeðla\'s dance is gentle: in a play as it comes her crest is asked to move under 0.1 m a frame, but in the rewind and at "Dansa!"', () => {
  let last = null;
  let most = { moved: 0 };
  for (const setBeat of frames(30)) {
    const pose = sloedlaAt(clockAt(setBeat));
    const bent = (setBeat >= BENDS.rewind.from && setBeat < BENDS.rewind.to + 0.1) || snap(setBeat, last?.setBeat ?? 0);
    if (last && !bent) {
      const moved = crestMove(pose, last.pose);
      if (moved > most.moved) most = { moved, setBeat };
    }
    last = { setBeat, pose };
  }
  assert.ok(most.moved < 0.1, `the most is ${most.moved.toFixed(3)} m, at the set's beat ${most.setBeat.toFixed(1)}`);
});

test('less motion: no flight, no jump, no spin, nobody off the ground; a gentle sway', () => {
  for (const setBeat of frames(10)) {
    const reduced = { reduced: true };
    const egill = at('egill', setBeat, reduced);
    assert.ok(egill.lift === 0 && egill.hop.weight === 0 && egill.spin === 0 && egill.yaw === 0 && Math.abs(egill.roll) < 3.5, `Egill at ${setBeat.toFixed(1)}`);
    const mosi = at('mosi', setBeat, reduced);
    assert.ok(mosi.lift === 0 && mosi.rear === 0 && Object.values(mosi.feet).every(v => v === 0) && Math.abs(mosi.roll) < 1.5, `Mosi at ${setBeat.toFixed(1)}`);
    const flugedla = at('flugedla', setBeat, reduced);
    assert.ok(flugedla.air === 0 && Math.abs(flugedla.lift) < 0.03 && Object.values(flugedla.clips).every(clip => clip.weight === 0), `Flugeðla at ${setBeat.toFixed(1)}`);
    const [her, whole] = [at('sloedla', setBeat, reduced), at('sloedla', setBeat)];
    assert.ok(Math.abs(her.side) <= Math.abs(whole.side) / 2 + 1e-9 && her.lean === 0 && Math.abs(her.lift) < 0.15, `Slóeðla at ${setBeat.toFixed(1)}`);
  }
  assert.ok(at('egill', 270, { reduced: true }).arms.right.up > 0.5 && at('flugedla', 270, { reduced: true }).raise.left > 10, 'hands and wings still go up');
  assert.ok(energy(300) > energy(100) && energy(100) > energy(20) && energy(245) < 0.1, 'the party grows, and hushes for her horn');
});

// ---------------------------------------------------------------------------------------------
// The score on the real models (kafli5-people.js, and her dance in kafli5-sloedla.js): the four at the pool as the set finds them,
// played through the whole set a thirtieth of a second at a time, as the chapter's own test plays it.
const { chapter } = await import('../chapters/kafli5.js');
const { chapterWorld } = await import('./chapter-harness.mjs');
const { updateActors } = await import('../engine/actor.js');
const { sloedlaLife, DANCE } = await import('../chapters/kafli5-sloedla.js');
const { createPeople } = await import('../chapters/kafli5-people.js');
const { SPOTS } = await import('../chapters/kafli5-pool.js');
const THREE = await import('three');
const FRAME = 1 / 30;
const HORNS = SET.cues.filter(event => event.kind === 'horn').map(event => event.beat);

/** The four at the pool, she waded out, and the set ready to start: { world, c, start(), step(setBeat), play(from, to, each), people }. */
async function atThePool({ reduced = false } = {}) {
  const world = await chapterWorld(chapter);
  const actor = name => ({ raw: world.actors.get(name) });
  const c = { world, reduced, egill: actor('egill'), mosi: actor('mosi'), flugedla: actor('flugedla'), sloedla: actor('sloedla') };
  c.mosi.raw.place(...SPOTS.mosi, headingTo(SPOTS.mosi, SPOTS.reed));
  c.egill.raw.place(...SPOTS.egill, headingTo(SPOTS.egill, SPOTS.reed));
  c.flugedla.raw.place(...FAR_POOL.landing, FAR_POOL.facing);
  c.her = sloedlaLife(c.sloedla);
  c.her.hide();
  c.her.courage = 1;
  c.her.wade();
  const tick = () => updateActors(world.actors.values(), FRAME);
  for (let i = 0; i < 3000 && c.her.moving; i++) tick();
  for (let i = 0; i < 60; i++) tick();
  c.her.idle();
  c.flugedla.raw.play('happy', { fade: 0.4 }); // as the set starts (kafli5.js)
  let horn = 0;
  const run = {
    world, c, tick, people: null,
    start() { run.people = createPeople(c); return run; },
    /** One frame at the set's beat `setBeat`: the video's clock, her horn on its cues, everyone's update. */
    step(setBeat) {
      while (horn < HORNS.length && HORNS[horn] <= setBeat) { c.her.blow({ seconds: BEAT }); horn++; }
      run.people.update({ ...danceBeatAt(setBeat), setBeat });
      tick();
    },
    /** Plays from the set's beat `from` to `to`, calling `each(setBeat)` after every frame. */
    play(from, to, each = null) {
      while (horn < HORNS.length && HORNS[horn] < from) horn++;
      for (let b = from; b <= to + 1e-9; b += FRAME / BEAT) { run.step(b); each?.(b); }
    },
  };
  return run;
}
const worldOf = (actor, name) => actor.model.getObjectByName(name).getWorldPosition(new THREE.Vector3());

test('on her model: through the whole set, the rewind and "Dansa!", nothing of Slóeðla moves over 0.1 m or 8 degrees in a frame, and she keeps up with her dance', async t => {
  const run = (await atThePool()).start();
  const { c } = run;
  const DEG = 180 / Math.PI;
  let last = null;
  const jumps = [];
  const late = [];
  let most = { moved: 0, looked: 0 };
  run.play(0, OVER, setBeat => {
    const p = c.her.points();
    if (last) {
      const moved = Math.max(...['root', 'head', 'eyes', 'crest'].map(k => p[k].distanceTo(last[k])));
      const looked = p.facing.angleTo(last.facing) * DEG;
      const turned = Math.abs(p.heading - last.heading);
      if (moved > most.moved) most = { ...most, moved, movedAt: setBeat };
      if (looked > most.looked) most = { ...most, looked, lookedAt: setBeat };
      if (moved > 0.1 || looked > 8 || turned > 8) jumps.push(`${setBeat.toFixed(2)}: ${moved.toFixed(3)} m, head ${looked.toFixed(1)}, body ${turned.toFixed(1)} degrees`);
    }
    // behind her dance only where the clock races (the rewind) or leaps ("Dansa!"), and soon back with it
    const bent = (setBeat >= BENDS.rewind.from && setBeat < BENDS.rewind.to + 3) || (setBeat >= BENDS.freeze.to && setBeat < BENDS.freeze.to + 3);
    if (c.her.behind > 1e-6 && !bent) late.push(`${setBeat.toFixed(2)}: ${c.her.behind.toFixed(2)}`);
    last = p;
  });
  t.diagnostic(`the most she moves in a frame: ${most.moved.toFixed(3)} m at ${most.movedAt.toFixed(1)}; her head turns ${most.looked.toFixed(1)} degrees at ${most.lookedAt.toFixed(1)}; behind her dance in ${late.length} frames outside the rewind and "Dansa!": ${late.slice(0, 12).join('; ')}`);
  assert.deepEqual(jumps.slice(0, 5), [], `${jumps.length} jumps`);
  assert.ok(most.moved <= 0.1 && DANCE.speed * FRAME < 0.095, `the most she moves in a frame is ${most.moved.toFixed(3)} m (the set's beat ${most.movedAt.toFixed(1)}); her head turns ${most.looked.toFixed(1)} degrees (${most.lookedAt.toFixed(1)})`);
  assert.ok(late.length < 70, `she is behind her dance in ${late.length} frames of a play as it comes: ${late.slice(0, 8).join('; ')}`);
});

test('on the models: Egill claps and his hands go up; Mosi sways from foot to foot and rears; Flugeðla\'s wings open, lift and beat the water, and she flies', async () => {
  const run = (await atThePool()).start();
  const { c } = run;
  const [egill, mosi, flugedla] = [c.egill.raw, c.mosi.raw, c.flugedla.raw];
  const span = () => worldOf(flugedla, 'LeftFinger3').distanceTo(worldOf(flugedla, 'RightFinger3'));
  const hands = () => worldOf(egill, 'LeftHand').distanceTo(worldOf(egill, 'RightHand'));
  const seen = {};
  const ground = mosi.root.position.y;
  const marks = [
    [10, () => { seen.folded = span(); }],
    [18, () => { seen.welcome = span(); }],
    [28, () => { seen.flying = flugedla.root.position.y - ground; }],
    [45, () => { seen.clap = hands(); }],
    [46, () => { seen.open = hands(); }],
    [73, () => { seen.right = { l: worldOf(mosi, 'FrontFootL').y, r: worldOf(mosi, 'FrontFootR').y, head: worldOf(mosi, 'Jaw').y }; }],
    [74, () => { seen.between = { head: worldOf(mosi, 'Jaw').y }; }],
    [75, () => { seen.left = { l: worldOf(mosi, 'FrontFootL').y, r: worldOf(mosi, 'FrontFootR').y }; }],
    [129.55, () => { seen.unslap = worldOf(flugedla, 'LeftFinger3').y - flugedla.root.position.y - 0.65; }],
    [130, () => { seen.slap = worldOf(flugedla, 'LeftFinger3').y - flugedla.root.position.y - 0.65; }], // she stands in 0.65 m of water
    [270, () => {
      seen.up = {
        hands: Math.min(worldOf(egill, 'LeftHand').y, worldOf(egill, 'RightHand').y), head: worldOf(egill, 'Head').y,
        tips: Math.min(worldOf(flugedla, 'LeftFinger3').y, worldOf(flugedla, 'RightFinger3').y), beak: worldOf(flugedla, 'Head').y, span: span(),
      };
    }],
    [297.4, () => { seen.rear = { front: worldOf(mosi, 'FrontFootL').y, back: worldOf(mosi, 'BackFootL').y }; }],
  ];
  let next = 0;
  let sunk = 0;
  run.play(0, 300, setBeat => {
    while (next < marks.length && setBeat >= marks[next][0]) marks[next++][1]();
    for (const foot of ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR']) sunk = Math.min(sunk, worldOf(mosi, foot).y - ground - 0.18);
  });
  assert.ok(seen.folded < 3 && seen.welcome > 5.5, `her wings: ${seen.folded.toFixed(1)} m tip to tip folded, ${seen.welcome.toFixed(1)} m spread for the welcome`);
  assert.ok(seen.flying > 3, `she flies (${seen.flying.toFixed(1)} m over her ground at 28)`);
  assert.ok(seen.clap < 0.08 && seen.open > 0.2, `Egill claps: his hands ${seen.clap.toFixed(2)} m apart on the clap, ${seen.open.toFixed(2)} m between`);
  assert.ok(seen.right.l > seen.right.r + 0.1 && seen.left.r > seen.left.l + 0.1, `Mosi's light feet come up (${JSON.stringify(seen.right)}, ${JSON.stringify(seen.left)})`);
  assert.ok(seen.right.head < seen.between.head - 0.05, `and his head goes down on the backbeat (${seen.right.head.toFixed(2)} against ${seen.between.head.toFixed(2)} m)`);
  assert.ok(sunk > -0.03, `his feet never go under the ground (${sunk.toFixed(3)} m)`);
  assert.ok(seen.slap < 0.25 && seen.unslap > 2, `Flugeðla's wing tip comes down on the water on the band's wing beat (from ${seen.unslap.toFixed(2)} to ${seen.slap.toFixed(2)} m over it)`);
  assert.ok(seen.up.hands > seen.up.head + 0.02, `Egill's hands are over his head (${seen.up.hands.toFixed(2)} against ${seen.up.head.toFixed(2)} m)`);
  assert.ok(seen.up.tips > seen.up.beak + 0.5 && seen.up.span > 3, `Flugeðla's wing tips are over her head (${seen.up.tips.toFixed(2)} against ${seen.up.beak.toFixed(2)} m), ${seen.up.span.toFixed(1)} m apart`);
  assert.ok(seen.rear.front > seen.rear.back + 0.25, `Mosi rears on the drop (${JSON.stringify(seen.rear)})`);
});

test('on her model: she turns where she stands to the group whose part it is, however the clock comes to that part, and back', async () => {
  const run = (await atThePool()).start();
  const { c } = run;
  const her = c.sloedla.raw;
  const facing = () => {
    const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(her.root.quaternion);
    return (Math.atan2(ahead.z, ahead.x) * 180) / Math.PI;
  };
  const home = facing();
  // played as it comes: her body is round to the lizards by their part's second bar
  run.play(170, 184);
  const lizards = headingTo(WADE.at, CHOIR.lizards.at);
  assert.ok(angle(facing(), lizards) < 60 && angle(facing(), home) > 80, `her body has turned to the lizards (${facing().toFixed(0)}, they are at ${lizards.toFixed(0)}, she stood at ${home.toFixed(0)} degrees)`);
  assert.ok(angle((Math.atan2(c.her.points().facing.z, c.her.points().facing.x) * 180) / Math.PI, lizards) < 30, 'and her head on to them');
  // the clock leaps to another part (a seek, a still): she comes round to it in a second or two, never stuck
  for (let i = 0; i < 75; i++) run.step(132);
  const grazers = headingTo(WADE.at, CHOIR.grazers.at);
  assert.ok(c.her.behind < 1e-6 && angle(facing(), grazers) < 35, `round to the grazers (${facing().toFixed(0)}, they are at ${grazers.toFixed(0)}; ${c.her.behind.toFixed(1)} behind)`);
  for (let i = 0; i < 75; i++) run.step(232);
  assert.ok(c.her.behind < 1e-6 && angle(facing(), home) < 3, 'and facing Egill\'s bank again for her horn');
});

test('on the models: "Egill, segðu já!" his hands are at his mouth; Stoppdans holds everyone; and all are given back as they stood', async () => {
  const run = await atThePool();
  const { c, world } = run;
  const stood = Object.fromEntries(['egill', 'mosi', 'flugedla', 'sloedla'].map(name => {
    const actor = world.actors.get(name);
    return [name, { position: actor.root.position.clone(), heading: actor.heading, head: actor.headPosition(new THREE.Vector3()) }];
  }));
  run.start();
  assert.deepEqual(run.people.rigs, ['egill', 'mosi', 'flugedla']);
  // Stoppdans: a frame deep in the freeze is the frame after "Stopp!"
  const frozen = [];
  const parts = () => ['egill', 'mosi', 'flugedla', 'sloedla'].flatMap(name => ['Head', name === 'egill' ? 'LeftHand' : 'Tail3'].map(b => worldOf(world.actors.get(name), b)));
  let cup = null;
  run.play(340, OVER, setBeat => {
    if (setBeat >= 363 && setBeat < 371.5) frozen.push(parts());
    if (!cup && setBeat >= 408) {
      const egill = c.egill.raw;
      const mouth = worldOf(egill, 'Head');
      cup = ['LeftHand', 'RightHand'].map(hand => worldOf(egill, hand).distanceTo(mouth));
    }
  });
  assert.ok(frozen.length > 100, `${frozen.length} frames of the freeze`);
  const drift = Math.max(...frozen.flatMap(frame => frame.map((p, k) => p.distanceTo(frozen[0][k]))));
  assert.ok(drift < 0.012, `nobody moves in Stoppdans (${drift.toFixed(4)} m at the most)`);
  assert.ok(cup.every(d => d < 0.2), `his hands are at his mouth (${cup.map(d => d.toFixed(2))} m from his head bone)`);
  // the set is over: everyone as they stood
  run.people.dispose();
  for (let i = 0; i < 90; i++) run.tick();
  for (const name of ['egill', 'mosi', 'flugedla']) {
    const actor = world.actors.get(name);
    assert.equal(actor.controlled, false, `${name} is given back`);
    assert.ok(actor.root.position.distanceTo(stood[name].position) < 1e-6 && angle(actor.heading, stood[name].heading) < 1e-6, `${name} stands where it stood`);
  }
  const her = world.actors.get('sloedla');
  assert.ok(her.controlled && her.root.position.distanceTo(stood.sloedla.position) < 1e-3 && angle(her.heading, stood.sloedla.heading) < 0.1, 'Slóeðla stands as her life has her');
  assert.ok(her.headPosition(new THREE.Vector3()).distanceTo(stood.sloedla.head) < 0.25, 'her head where it was');
  run.people.dispose(); // twice is once
});
