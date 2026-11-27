// Stjörnuhátíðin's party moves (remake/chapters/hatid-dance.js, Task 15): Slóeðla calls a move and everyone does it, each in her own
// body, on the song's dance beat; between calls each grooves in her own way; the constellations dance with their friends; the floor
// lights under the feet that land. The eight are the game's own models at their party stands (tests/characters.mjs), played frame
// by frame at 30 frames a second as the game plays them: the dance first (a scene's frame), then the actors, then the sky.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createActor } from '../engine/actor.js';
import { createConstellations } from '../engine/constellations.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { FRIENDS8, partyStands, partyPlace, SKY } from '../chapters/hatid-route.js';
import { BEAT, CAMERA, END_BEAT, TRICK_CUT, callAt, cuesIn, soloAt } from '../chapters/hatid-score.js';
import { SONG } from '../chapters/hatid-song.js';
import { floorAt, spotsAt, stageLightAt, skyBurstsAt, auroraAt, breathAt, moonAt, fireworksAt, partyLook, BREATH, SKY_BURSTS, MOON_FINALE, FRIEND_HUES, END_TAIL, FIREFLY_QUIET } from '../chapters/hatid-stage.js';
import { createNightSky, skyDirection, NIGHT } from '../engine/night-sky.js';
import { createDance, moveOf, grooveOf, grooveSize, moveAt, MOVES, CALL_LINE, HOP, LOOK_UP, lookUpAt } from '../chapters/hatid-dance.js';
import { createBand, ROLES, roleOf, SOLO_TRICKS, trickOf, lapAt, DECK, joltAt, roarAt, END_POSE } from '../chapters/hatid-band.js';
import { SHOTS, SHOWS, BUDGET, HEAD, LENGTH, tallShot } from '../chapters/hatid-route.js';
import { createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';
import { loadCharacter, emptyWorld } from './characters.mjs';

const FRAME = 1 / 30;
const DANCE_BEAT = SONG.danceBeats; // song beats a dance beat
const SIX = FRIENDS.map(f => f.key);
const deg = THREE.MathUtils.radToDeg;

/** The eight at their party stands, their six drawings at their party places (held in their traced pose, as scene 2 leaves them). */
const made = new Map();
function party({ reduced = false } = {}) {
  if (!made.has(reduced)) made.set(reduced, (async () => {
    const world = emptyWorld();
    const stands = partyStands();
    const c = { world, reduced, stands: { party: stands } };
    for (const who of FRIENDS8) {
      const actor = await createActor(world, { name: who, gltf: await loadCharacter(who) });
      world.actors.set(who, actor);
      const { at, heading } = stands[who];
      actor.place(at[0], at[1], heading);
      actor.play('idle', { fade: 0 });
      actor.update(0);
      c[who] = { raw: actor };
    }
    c.figures = createConstellations(world, { capacity: 6 });
    for (const { key, colour } of FRIENDS) {
      c.figures.add(key, c[key].raw, { colour, ...partyPlace(key), span: SKY.party.span, still: true });
      c.figures.set(key, { drawn: 1, level: 1 });
    }
    // Kambeðla's plates as the party has them (engine/plate-glow.js's calls, kept to be read)
    c.plates = {
      rows: 3, levels: [1, 1, 1], hues: [null, null, null],
      setRow(i, level) { this.levels[i] = level; }, setRowColour(i, colour) { this.hues[i] = colour; }, setAll(level) { this.levels.fill(level); },
    };
    c.dance = createDance(c);
    c.band = createBand(c); // Task 16: the band's parts and the six solos, over the dance
    const bones = Object.fromEntries(FRIENDS8.map(who => [who, new Map()]));
    for (const who of FRIENDS8) c[who].raw.model.traverse(o => { if (o.isBone && !bones[who].has(o.name)) bones[who].set(o.name, o); });
    const frame = beat => {
      c.partyBeat = beat;
      c.band.update(beat);
      c.dance.update(beat);
      for (const who of FRIENDS8) c[who].raw.update(FRAME);
      for (const who of FRIENDS8) c[who].raw.root.updateMatrixWorld(true);
      c.band.place();
    };
    return { world, c, stands, bones, frame };
  })());
  return made.get(reduced);
}
const at = (p, who, bone) => p.bones[who].get(bone).getWorldPosition(new THREE.Vector3());
/** Every frame from `from` to `to` (beats), each frame's beat to `see`. */
function play(p, from, to, see) {
  for (let t = from * BEAT; t <= to * BEAT + 1e-9; t += FRAME) {
    const beat = t / BEAT;
    p.frame(beat);
    see?.(beat);
  }
}
/** Where a call's move runs, as the map has it (callAt): its first and last beat. */
function moveSpan(call) {
  let end = call.doBeat;
  while (callAt(end)?.doing && callAt(end).move === call.move) end += 1 / 8;
  return [call.doBeat, end];
}
const FEET = {
  egill: ['LeftFoot', 'RightFoot'], gramedla: ['LeftFoot', 'RightFoot'], uggedla: ['LeftFoot', 'RightFoot'], flugedla: ['LeftFoot', 'RightFoot'],
  mosi: ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'], thorsedla: ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'],
  sloedla: ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'], kambedla: ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'],
};
const lowestFoot = (p, who) => Math.min(...FEET[who].map(f => at(p, who, f).y));

test('each call is followed by its move: everyone does it on the bar after the gap, once a dance beat for as long as the map says, and it is the move she named', () => {
  assert.deepEqual(MOVES, ['up', 'stomp', 'spin', 'hop']);
  assert.deepEqual(CALL_LINE, { up: 'h_sloedla_up', stomp: 'h_sloedla_stomp', spin: 'h_sloedla_spin', hop: 'h_sloedla_hop' });
  assert.equal(SONG.song.calls.length, 8);
  for (const call of SONG.song.calls) {
    const [from, to] = moveSpan(call);
    assert.equal(from % 4, 0, `${call.move} at ${call.beat}: its move starts on a bar`);
    assert.equal(from, call.beat + 4, 'the bar after the gap');
    for (let b = call.beat; b < from; b += 0.25) {
      const m = moveAt(b); // nothing but the groove in the gap, or the move before going out
      assert.ok(!m || (m.call !== SONG.song.calls.indexOf(call) && b >= m.to), `nothing new in the gap (${b}: ${m?.move})`);
    }
    const times = (to - from) / DANCE_BEAT;
    assert.ok(times >= 6 && Number.isInteger(times), `${call.move} at ${call.beat}: ${times} times`);
    for (let b = from + 1; b < to; b += 0.5) {
      const m = moveAt(b);
      assert.equal(m?.move, call.move, `${call.move} at ${b}`);
      assert.ok(Math.abs(m.n - (b - from) / DANCE_BEAT) < 1e-9, 'counted in dance beats from its start');
      assert.ok(m.weight > 0.99, `done whole at ${b}`);
    }
    assert.ok(moveAt(to + 3) === null || moveAt(to + 3).call !== SONG.song.calls.indexOf(call), 'and over soon after');
  }
});

test('each friend does a move in her own body: up lifts Þórseðla\'s head 2 m or more and both of Egill\'s hands over his head; hop takes Egill\'s feet 0.3 m or more off the ground and none of Grameðla\'s', async () => {
  const p = await party();
  // in the gap before "up" they groove; on the move's third dance beat they are up
  p.frame(74);
  const head = at(p, 'thorsedla', 'Head').y;
  p.frame(80);
  assert.ok(at(p, 'thorsedla', 'Head').y - head >= 2, `Þórseðla's head up ${(at(p, 'thorsedla', 'Head').y - head).toFixed(2)} m`);
  // Egill's hands clearly over his head (fix 1: his hands by his ears read as hands on ears): both wrists 0.15 m or more over the
  // top of his head (his skinned silhouette's top in the gap, carried with his Head bone), and his arms their own length again after
  p.frame(74);
  const egill = p.c.egill.raw.model;
  const headBone = p.bones.egill.get('Head');
  egill.updateMatrixWorld(true);
  const crown = new THREE.Box3().setFromObject(egill, true).max.y;
  const headAt = headBone.getWorldPosition(new THREE.Vector3());
  const topLocal = headBone.worldToLocal(new THREE.Vector3(headAt.x, crown, headAt.z));
  const low = ['LeftHand', 'RightHand'].map(h => at(p, 'egill', h).y);
  const own = (await loadCharacter('egill')).scene.getObjectByName('LeftLowerArm').position.length();
  const armLength = () => p.bones.egill.get('LeftLowerArm').position.length();
  assert.ok(Math.abs(armLength() - own) < 1e-6, `Egill's arm its own length in the gap (${armLength().toFixed(4)} against ${own.toFixed(4)})`);
  p.frame(80);
  const top = headBone.localToWorld(topLocal.clone()).y;
  for (const hand of ['LeftHand', 'RightHand']) assert.ok(at(p, 'egill', hand).y >= top + 0.15, `Egill's ${hand} over his head's top (${(at(p, 'egill', hand).y - top).toFixed(3)} m)`);
  ['LeftHand', 'RightHand'].forEach((h, k) => assert.ok(at(p, 'egill', h).y - low[k] > 0.3, `Egill's ${h} up ${(at(p, 'egill', h).y - low[k]).toFixed(2)} m`));
  p.frame(91);
  assert.ok(Math.abs(armLength() - own) < 1e-6, `Egill's arm its own length after the move (${armLength().toFixed(4)})`);
  // hop: at the top of a hop (the middle of a dance beat), against her feet as they stand in the gap before it
  p.frame(122);
  const rest = { egill: lowestFoot(p, 'egill'), gramedla: lowestFoot(p, 'gramedla') };
  p.frame(129);
  assert.ok(lowestFoot(p, 'egill') - rest.egill >= 0.3, `Egill's feet ${(lowestFoot(p, 'egill') - rest.egill).toFixed(2)} m up`);
  assert.ok(lowestFoot(p, 'gramedla') - rest.gramedla < 0.05, `Grameðla's feet stay down (${(lowestFoot(p, 'gramedla') - rest.gramedla).toFixed(2)})`);
  assert.equal(HOP.gramedla, 0);
  assert.equal(HOP.thorsedla, 0);
  // her own body: each move turns other bones in each friend, and no two friends do a move the same way
  for (const move of MOVES) {
    const ways = FRIENDS8.map(who => {
      const pose = moveOf(who, move, 0.5, {});
      return JSON.stringify(Object.keys(pose.turns ?? {}).sort()) + (pose.spin ? 's' : '') + (pose.lift ? 'l' : '') + (pose.dip ? 'd' : '');
    });
    assert.ok(new Set(ways).size >= 5, `${move}: ${new Set(ways).size} ways among the eight`);
  }
});

// (Task 15b, the owner's word of 2026-11-27: his arms stretched read as ruined) Egill dances with his own moves from chapter 5's show
const ARM = { Left: ['LeftUpperArm', 'LeftLowerArm', 'LeftHand'], Right: ['RightUpperArm', 'RightLowerArm', 'RightHand'] };
test('no bone of Egill is ever stretched: through the whole party, with and without less motion, shoulder to elbow and elbow to hand are as long as in his own pose', async () => {
  const own = (await loadCharacter('egill')).scene;
  own.updateMatrixWorld(true);
  const w = name => own.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  const rest = Object.fromEntries(Object.entries(ARM).map(([side, [s, e, h]]) => [side, [w(s).distanceTo(w(e)), w(e).distanceTo(w(h))]]));
  for (const reduced of [false, true]) {
    const p = await party({ reduced });
    let worst = { d: 0 };
    play(p, 0, 364, beat => {
      for (const [side, [s, e, h]] of Object.entries(ARM)) {
        const [S, E, H] = [s, e, h].map(n => at(p, 'egill', n));
        const d = Math.max(Math.abs(S.distanceTo(E) - rest[side][0]), Math.abs(E.distanceTo(H) - rest[side][1]));
        if (d > worst.d) worst = { d, side, beat };
      }
    });
    assert.ok(worst.d < 0.001, `${reduced ? 'less motion: ' : ''}Egill's ${worst.side} arm ${(worst.d * 1000).toFixed(1)} mm off its own length at beat ${worst.beat?.toFixed(2)}`);
  }
});

/** The top of Egill's head (his skinned silhouette's top in the gap before the first call), carried with his Head bone. */
function headTop(p) {
  p.frame(73.95); p.frame(74);
  const model = p.c.egill.raw.model;
  model.updateMatrixWorld(true);
  const crown = new THREE.Box3().setFromObject(model, true).max.y;
  const head = p.bones.egill.get('Head');
  const headAt = head.getWorldPosition(new THREE.Vector3());
  const local = head.worldToLocal(new THREE.Vector3(headAt.x, crown, headAt.z));
  return () => head.localToWorld(local.clone()).y;
}
const flat = v => new THREE.Vector2(v.x, v.z);

test('"Hendur upp!": Egill\'s hands are over the top of his head and wider apart than his shoulders for the whole move after its first beat', async () => {
  const p = await party();
  const top = headTop(p);
  for (const call of SONG.song.calls.filter(c => c.move === 'up')) {
    const [from, to] = moveSpan(call);
    let worst = { over: Infinity, apart: Infinity };
    play(p, from + 1, to, beat => {
      const [L, R] = ['LeftHand', 'RightHand'].map(h => at(p, 'egill', h));
      const over = Math.min(L.y, R.y) - top();
      const apart = flat(L).distanceTo(flat(R)) - flat(at(p, 'egill', 'LeftUpperArm')).distanceTo(flat(at(p, 'egill', 'RightUpperArm')));
      if (over < worst.over) Object.assign(worst, { over, overAt: beat });
      if (apart < worst.apart) Object.assign(worst, { apart, apartAt: beat });
    });
    assert.ok(worst.over > 0, `up at ${call.beat}: his lower hand ${(worst.over * 100).toFixed(1)} cm over his head's top at ${worst.overAt.toFixed(2)}`);
    assert.ok(worst.apart > 0, `up at ${call.beat}: his hands ${(worst.apart * 100).toFixed(1)} cm wider apart than his shoulders at ${worst.apartAt.toFixed(2)}`);
  }
});

test('"Hoppa!": Egill is off the ground between the dance beats and down on them', async () => {
  const p = await party();
  for (const call of SONG.song.calls.filter(c => c.move === 'hop')) {
    const [from, to] = moveSpan(call);
    p.frame(from - 2.05); p.frame(from - 2); // the groove's feet are down on a beat
    const rest = lowestFoot(p, 'egill');
    for (let k = 0; k < (to - from) / DANCE_BEAT; k++) {
      const top = from + (k + 0.5) * DANCE_BEAT;
      p.frame(top - 0.05); p.frame(top);
      assert.ok(lowestFoot(p, 'egill') - rest >= 0.25, `hop at ${call.beat}: off the ground at ${top} (${(lowestFoot(p, 'egill') - rest).toFixed(2)} m)`);
      if (k === 0) continue;
      const down = from + k * DANCE_BEAT;
      p.frame(down - 0.05); p.frame(down);
      assert.ok(lowestFoot(p, 'egill') - rest < 0.03, `hop at ${call.beat}: down on ${down} (${(lowestFoot(p, 'egill') - rest).toFixed(3)} m)`);
    }
  }
});

test('Grameðla\'s stomp lands on the beat, within a frame', async () => {
  const p = await party();
  for (const call of SONG.song.calls.filter(c => c.move === 'stomp')) {
    const [from, to] = moveSpan(call);
    const landings = [];
    const FEET2 = ['LeftFoot', 'RightFoot'];
    const was = [0, 0];
    p.frame(20); // before her entry: her feet at rest (from Task 16 she drums on the stomp cues outside the move too)
    const rest = FEET2.map(f => at(p, 'gramedla', f).y);
    play(p, from - 0.5, to + 0.5, beat => {
      FEET2.forEach((f, k) => {
        const lift = at(p, 'gramedla', f).y - rest[k];
        if (was[k] >= 0.06 && lift < 0.06) landings.push(beat); // the frame that foot comes down
        was[k] = lift;
      });
    });
    const merged = landings.sort((a, b) => a - b).filter((b, i, all) => i === 0 || b - all[i - 1] > 0.5);
    const cues = cuesIn('stomp', from + 0.5, to + 0.01).map(cue => cue.beat);
    assert.ok(cues.length >= 5, `${cues.length} stomp cues in the move at ${call.beat}`);
    for (const cue of cues) {
      const near = merged.find(b => Math.abs(b - cue) * BEAT <= FRAME + 1e-6);
      assert.ok(near !== undefined, `a foot lands on the stomp at beat ${cue} (landings ${merged.map(b => b.toFixed(2)).join(' ')})`);
    }
  }
});

test('the dance is a function of the beat: the same beat gives the same pose whatever came before, and nothing jumps more than 12 degrees or 0.2 m in a frame at 30 frames a second', async () => {
  const p = await party();
  const snap = () => {
    const out = [];
    for (const who of FRIENDS8) {
      const a = p.c[who].raw;
      out.push(...a.model.position.toArray(), ...a.model.quaternion.toArray(), ...a.root.position.toArray());
      for (const bone of p.bones[who].values()) out.push(...bone.quaternion.toArray(), ...bone.position.toArray());
    }
    return out;
  };
  // the same beat from different pasts
  const BEATS = [77.3, 95.1, 110.6, 127.2, 140, 262.4, 285.9, 306.1, 330.5];
  const first = BEATS.map(b => { p.frame(b - 0.4); p.frame(b - 0.2); p.frame(b); return snap(); });
  const again = [...BEATS].reverse().map(b => { p.frame(b + 7); p.frame(b - 0.2); p.frame(b); return snap(); }).reverse();
  first.forEach((s, k) => s.forEach((v, i) => assert.ok(Math.abs(v - again[k][i]) < 1e-5, `beat ${BEATS[k]}: the same pose (${v} against ${again[k][i]})`)));
  // no jumps, through the first dance and the last chorus's moves (her body's middle, which a spin turns her round, and her root)
  const worst = { degrees: 0, metres: 0, where: '' };
  for (const [from, to] of [[70, 137], [250, 349]]) {
    let last = null;
    play(p, from, to, beat => {
      const now = FRIENDS8.map(who => {
        const a = p.c[who].raw;
        return { who, model: p.c.dance.middle(who), turn: a.model.quaternion.clone(), root: a.root.position.clone(), bones: [...p.bones[who].values()].map(b => b.quaternion.clone()) };
      });
      if (last) {
        now.forEach((n, k) => {
          const l = last[k];
          const metres = Math.max(n.model.distanceTo(l.model), n.root.distanceTo(l.root));
          const degrees = Math.max(deg(n.turn.angleTo(l.turn)), ...n.bones.map((q, i) => deg(q.angleTo(l.bones[i]))));
          if (degrees > worst.degrees) Object.assign(worst, { degrees, where: `${n.who} at ${beat.toFixed(2)} (${[...p.bones[n.who].keys()][n.bones.reduce((w, q, i) => (q.angleTo(l.bones[i]) > n.bones[w].angleTo(l.bones[w]) ? i : w), 0)]})` });
          if (metres > worst.metres) Object.assign(worst, { metres, whereM: `${n.who} at ${beat.toFixed(2)}` });
        });
      }
      last = now;
    });
  }
  assert.ok(worst.degrees <= 12, `${worst.degrees.toFixed(1)} degrees in a frame (${worst.where})`);
  assert.ok(worst.metres <= 0.2, `${worst.metres.toFixed(3)} m in a frame (${worst.whereM})`);
});

test('the constellations dance with them: in the hop each friend\'s constellation rises and falls with her, and in up Þórseðla\'s head star climbs', async () => {
  const p = await party();
  const star = key => p.c.figures.starOf(key).elevation;
  p.frame(127.95);
  p.frame(128);
  const down = Object.fromEntries(SIX.map(key => [key, star(key)]));
  p.frame(129);
  const up = Object.fromEntries(SIX.map(key => [key, star(key)]));
  p.frame(130);
  const downAgain = Object.fromEntries(SIX.map(key => [key, star(key)]));
  for (const key of SIX.filter(k => HOP[k] > 0)) {
    assert.ok(up[key] - down[key] > 0.15, `${key}'s drawing rises in her hop (${(up[key] - down[key]).toFixed(2)} degrees)`);
    assert.ok(Math.abs(downAgain[key] - down[key]) < 0.25, `and comes down with her (${(downAgain[key] - down[key]).toFixed(2)})`);
  }
  p.frame(74);
  const before = star('thorsedla');
  p.frame(80);
  assert.ok(star('thorsedla') - before > 0.8, `Þórseðla's head star climbs in up (${(star('thorsedla') - before).toFixed(2)} degrees)`);
  // Flugeðla's drawing is the flier's: it does not fold to her standing pose when it dances
  const outline = p.c.figures.outlineOf('flugedla');
  const span = Math.max(...outline.map(o => o.azimuth)) - Math.min(...outline.map(o => o.azimuth));
  assert.ok(span > SKY.party.span * 0.6, `her drawing keeps her wings wide (${span.toFixed(1)} degrees across)`);
});

test('nobody\'s feet leave her stand: every root stays within 1.5 m of it through the dance', async () => {
  const p = await party();
  let worst = { d: 0 };
  const centres = Object.fromEntries(FRIENDS8.map(who => { p.frame(74); const v = p.c[who].raw.centre(); return [who, v]; }));
  for (const [from, to] of [[70, 137], [250, 349]]) {
    play(p, from, to, beat => {
      for (const who of FRIENDS8) {
        const a = p.c[who].raw;
        const [x, z] = p.stands[who].at;
        const d = Math.hypot(a.root.position.x - x, a.root.position.z - z);
        const c = a.centre(new THREE.Vector3());
        const e = Math.hypot(c.x - centres[who].x, c.z - centres[who].z);
        if (Math.max(d, e) > worst.d) worst = { d: Math.max(d, e), who, beat };
      }
    });
  }
  assert.ok(worst.d <= 1.5, `${worst.who} ${worst.d.toFixed(2)} m from her stand at ${worst.beat?.toFixed(2)}`);
});

test('the flowers light under the feet that land: in the stomp a step lies under each stamping foot, as old as its landing', async () => {
  const p = await party();
  const call = SONG.song.calls.find(c => c.move === 'stomp');
  const [from] = moveSpan(call);
  const beat = from + 2 * DANCE_BEAT + 0.3; // 0.3 of a beat after a landing
  p.frame(beat);
  const feet = p.c.dance.feetAt(beat);
  const f = floorAt(beat, { feet, places: p.c.dance.places() });
  for (const who of ['egill', 'mosi', 'kambedla', 'uggedla']) {
    const mine = feet.filter(s => s.who === who);
    assert.ok(mine.length, `${who} has a foot down`);
    const landed = mine.find(s => Math.abs(s.age - 0.3) < 1e-6);
    assert.ok(landed, `${who}'s stamp is 0.3 of a beat old`);
    const step = f.steps.find(s => Math.hypot(s[0] - landed.x, s[1] - landed.z) < 0.01);
    assert.ok(step && Math.abs(step[4] - 0.3) < 1e-6, `a step of the floor under it, as old`);
  }
  // the places the floor takes are where they really stand
  const places = p.c.dance.places();
  for (const who of FRIENDS8) assert.deepEqual(places[who].slice(0, 2), p.stands[who].at);
  assert.ok(f.steps.length <= 16, `${f.steps.length} steps (the floor holds 16)`);
});

test('the dance module imports nothing of chapter 5\'s', () => {
  const text = fs.readFileSync(new URL('../chapters/hatid-dance.js', import.meta.url), 'utf8');
  assert.equal(/kafli5/.test(text.split('\n').filter(line => /^\s*import|from\s+['"]/.test(line)).join('\n')), false);
  assert.equal(/kafli5-dances|PARTS/.test(text), false);
  assert.equal(typeof grooveOf, 'function');
});

// ---------------------------------------------------------------------------------------------
// The band and the six solos (remake/chapters/hatid-band.js, Task 16): each friend plays a part of the song on her cues, and each
// has a solo of 12 beats with a trick of her own, seen close.
const SOLOS = SONG.song.solos;
const SOLO_OF = Object.fromEntries(SOLOS.map(s => [s.who, s]));
const inSolo = (who, beat) => beat >= SOLO_OF[who].startBeat && beat < SOLO_OF[who].startBeat + SOLO_OF[who].beats;
const ENTRY = Object.fromEntries(SONG.song.entries.map(e => [e.who, e.beat]));
const TOP_GROUND = 1.2; // the shots' ground (hatid-route.js GROUND)

test('everyone has a part and plays it on her cues: Grameðla\'s foot is down on every stomp cue, Uggeðla\'s tail on every tail cue, Flugeðla\'s wing on every scratch, Slóeðla\'s horn up on every horn cue', async () => {
  const p = await party();
  assert.deepEqual(Object.keys(ROLES).sort(), [...FRIENDS8].sort());
  // Grameðla: a foot lands on every stomp cue within a frame (in her solo: a foot is down on each, her giant ones land on theirs)
  p.frame(20);
  const FEET2 = ['LeftFoot', 'RightFoot'];
  const rest = FEET2.map(f => at(p, 'gramedla', f).y);
  const landings = [];
  const downAt = new Map();
  const was = [0, 0];
  const cues = cuesIn('stomp', -Infinity, Infinity).map(c => c.beat);
  for (const [from, to] of [[26, 210], [250, 349]]) {
    play(p, from, to, beat => {
      const lifts = FEET2.map((f, k) => at(p, 'gramedla', f).y - rest[k]);
      lifts.forEach((lift, k) => { if (was[k] >= 0.06 && lift < 0.06) landings.push(beat); was[k] = lift; });
      for (const cue of cues) if (Math.abs(beat - cue) * BEAT <= FRAME / 2 + 1e-6) downAt.set(cue, Math.min(...lifts));
    });
  }
  for (const cue of cues) {
    if (inSolo('gramedla', cue)) {
      assert.ok(downAt.get(cue) < 0.05, `a foot of hers down on the stomp at ${cue} (${downAt.get(cue)?.toFixed(2)})`);
      continue;
    }
    assert.ok(landings.some(b => Math.abs(b - cue) * BEAT <= FRAME + 1e-6), `her foot lands on the stomp at ${cue}`);
  }
  for (const b of [2, 4, 6]) {
    const cue = SOLO_OF.gramedla.startBeat + b;
    assert.ok(landings.some(x => Math.abs(x - cue) * BEAT <= FRAME + 1e-6), `a giant stomp lands at ${cue}`);
  }
  // Uggeðla's tail: on each tail cue its tip is whipped a metre or more from where it was half a beat before
  for (const cue of cuesIn('tail', -Infinity, Infinity).map(c => c.beat)) {
    p.frame(cue - 0.5);
    p.frame(cue - 0.45);
    const before = at(p, 'uggedla', 'Tail6');
    p.frame(cue);
    const d = at(p, 'uggedla', 'Tail6').distanceTo(before);
    assert.ok(d >= 1, `her tail whips on the tail cue at ${cue} (${d.toFixed(2)} m)`);
  }
  // Flugeðla's wing on the deck on every scratch (in her solo the scratches are her wingbeats in the air: her lap)
  const s = p.stands.flugedla;
  const [fx, fz] = [Math.cos(THREE.MathUtils.degToRad(s.heading)), Math.sin(THREE.MathUtils.degToRad(s.heading))];
  const deck = new THREE.Vector3(s.at[0] + fx * DECK.ahead - fz * DECK.right, DECK.size[1], s.at[1] + fz * DECK.ahead + fx * DECK.right);
  for (const cue of cuesIn('scratch', -Infinity, Infinity).map(c => c.beat)) {
    if (inSolo('flugedla', cue)) continue;
    if (moveAt(cue)) continue; // in a called move (wings up, a spin) the move wins, as the stomp does over Grameðla's drum
    p.frame(cue + 0.2);
    p.frame(cue + 0.3);
    const wing = at(p, 'flugedla', 'LeftWrist');
    const flat = Math.hypot(wing.x - deck.x, wing.z - deck.z);
    assert.ok(flat <= 1 && Math.abs(wing.y - deck.y) <= 0.6, `her wing on the deck at ${cue} (${flat.toFixed(2)} m off, ${(wing.y - deck.y).toFixed(2)} m up)`);
  }
  // Slóeðla's horn up on every horn cue: her snout 0.15 m or more higher over her head than it was just before
  const snout = () => at(p, 'sloedla', 'Jaw').y - at(p, 'sloedla', 'Head').y;
  for (const cue of cuesIn('horn', -Infinity, Infinity).map(c => c.beat)) {
    if (inSolo('sloedla', cue)) continue; // her solo's own horn: the trick's test
    if (cue >= END_POSE.from) continue; // (Task 17) the chord's horn is her end pose's: her horn up from its first beat (the end pose's test)
    const before = cue > 0 ? cue - 0.3 : 5; // (the song's first beat has no before: her head as it is once the horn is down)
    p.frame(before - 0.05);
    p.frame(before);
    const low = snout();
    p.frame(cue + 0.9);
    p.frame(cue + 1);
    assert.ok(snout() - low >= 0.15, `her horn up on the horn cue at ${cue} (${(snout() - low).toFixed(2)} m)`);
  }
});

test('a friend plays only once she has entered: before her entry she stands and watches', () => {
  const blank = () => ({ turns: {}, feet: { L: 0, R: 0 }, lift: 0, dip: 0 });
  const played = pose => Object.values(pose.turns).some(t => t.some(v => Math.abs(v) > 1e-9)) || pose.feet.L > 1e-9 || pose.feet.R > 1e-9;
  for (const who of ['gramedla', 'uggedla', 'thorsedla', 'flugedla']) {
    for (let b = 0.01; b < ENTRY[who] - 1; b += 0.25) assert.equal(played(roleOf(who, b, blank())), false, `${who} plays nothing at ${b.toFixed(2)}, before her entry at ${ENTRY[who]}`);
    let after = false;
    for (let b = ENTRY[who]; b < ENTRY[who] + 16 && !after; b += 0.125) after = played(roleOf(who, b, blank()));
    assert.ok(after, `${who} plays after her entry`);
  }
  // Slóeðla's entry is the song's first beat, and her horn is on it
  assert.equal(ENTRY.sloedla, 0);
  assert.ok(played(roleOf('sloedla', 0.5, blank())));
});

test('the six solos come in the map\'s order, each with the spotlights and a close shot on her from its first beat', async () => {
  const p = await party();
  assert.deepEqual(SOLOS.map(s => s.who), ['kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla', 'gramedla']);
  assert.deepEqual(Object.keys(SOLO_TRICKS), SOLOS.map(s => s.who));
  for (const { who, startBeat, beats } of SOLOS) {
    assert.equal(beats, 12);
    const cuts = CAMERA.filter(c => c.beat >= startBeat && c.beat < startBeat + beats);
    assert.deepEqual(cuts.map(c => [c.beat - startBeat, c.cut]), [[0, `solo_${who}`], [TRICK_CUT[who] ?? TRICK_CUT.others, `trick_${who}`]], `${who}'s shots`);
    for (const b of [0.01, 6, 11.9]) {
      for (const s of spotsAt(startBeat + b)) assert.ok(Math.hypot(s.to[0] - p.stands[who].at[0], s.to[2] - p.stands[who].at[1]) < 1.5, `a spotlight on ${who} at ${b}`);
      p.frame(startBeat + b);
      assert.equal(p.c.band.state().taken, who, `${who} is taken for her trick at ${b}`);
    }
  }
  p.frame(208.5);
  assert.equal(p.c.band.state().taken, null, 'and given back after the solos');
});

test('each trick is seen: Kambeðla\'s plates show six hues or more; a fish is in Uggeðla\'s jaws on beat 12; berries fall past Þórseðla\'s head; Flugeðla is back on her stand by her last beat; three prints are lit after Grameðla\'s third stomp', async () => {
  const p = await party();
  // Kambeðla: every hue of the six, a row at a time
  const { startBeat: k0 } = SOLO_OF.kambedla;
  const hues = new Set();
  play(p, k0, k0 + 12, () => { for (const h of p.c.plates.hues) if (h) hues.add(h); });
  assert.ok(hues.size >= 6, `${hues.size} hues on her plates`);
  p.frame(k0 + 13);
  assert.deepEqual(p.c.plates.hues, [null, null, null], 'her own lilac after it');
  // Uggeðla: the fifth fish in her jaws on the solo's ninth beat (the brief's beat 12 of 16), held there, then gulped
  const { startBeat: u0 } = SOLO_OF.uggedla;
  const fish = p.c.band.parts.fish;
  assert.deepEqual(Object.keys(fish.geometry.morphAttributes), [], 'the fish draw: no morph on an instanced mesh (three cannot draw one without its morph texture)');
  // (fix 1) the one she catches is its own mesh, with the model's flex: big, side on to the lens, its tail flapping
  const held = p.c.band.parts.held;
  const jawFish = () => (held.visible ? held.position.distanceTo(at(p, 'uggedla', 'Jaw')) : Infinity);
  const flex = () => held.morphTargetInfluences[held.morphTargetDictionary.flex];
  const flaps = [];
  for (const b of [9, 9.5, 10.5]) {
    p.frame(u0 + b - 0.05);
    p.frame(u0 + b);
    assert.ok(jawFish() <= 2.2, `a fish in her jaws at ${b}: across her snout, ${jawFish().toFixed(2)} m from its hinge`);
    assert.ok(held.scale.x * 0.3 >= 3, `the caught fish ${(held.scale.x * 0.3).toFixed(1)} m long, longer than her snout`);
    const cam = p.c.world.camera.position, along = new THREE.Vector3(1, 0, 0).applyQuaternion(held.quaternion);
    const look = held.position.clone().sub(cam).setY(0).normalize();
    assert.ok(Math.abs(along.setY(0).normalize().dot(look)) < 0.2, `the caught fish side on to the lens at ${b}`);
    flaps.push(flex(), (p.frame(u0 + b + 0.12), flex()));
  }
  assert.ok(Math.max(...flaps) - Math.min(...flaps) > 0.9, `its tail flaps: ${flaps.map(v => v.toFixed(2)).join(' ')}`);
  p.frame(u0 + 11.8);
  assert.equal(fish.count, 0, 'gulped');
  assert.equal(held.visible, false, 'gulped');
  for (const b of [1.5, 3, 5.5, 7.5]) { p.frame(u0 + b); assert.ok(fish.count + (held.visible ? 1 : 0) >= 1, `a fish in the air at ${b}`); }
  // Þórseðla: berries fall from over her head to under it, close by it
  const { startBeat: t0 } = SOLO_OF.thorsedla;
  const over = new Set(), past = new Set();
  play(p, t0, t0 + 12, beat => {
    const head = at(p, 'thorsedla', 'Head');
    for (const b of trickOf('thorsedla', (beat - t0) / 12, {}, { ground: 0 }).berries) {
      if (!b) continue;
      if (Math.hypot(b[0] - head.x, b[2] - head.z) > 3.5) continue;
      if (b[1] > head.y + 0.5) over.add(b[3]);
      else if (b[1] < head.y - 0.5 && over.has(b[3])) past.add(b[3]);
    }
  });
  assert.ok(past.size >= 30, `${past.size} berries fall past her head`);
  p.frame(t0 + 6);
  assert.ok(p.c.band.parts.berries.count >= 10, 'drawn');
  // Flugeðla: high in the air in her lap, back on her stand by her last beat
  const { startBeat: f0 } = SOLO_OF.flugedla;
  p.frame(f0 - 0.05);
  const home = p.c.dance.middle('flugedla');
  p.frame(f0 + 6);
  assert.ok(p.c.dance.middle('flugedla').y - home.y >= 10, 'up in the air in her lap');
  assert.ok(p.c.dance.middle('flugedla').distanceTo(home) >= 15, 'far from her stand');
  for (const b of [11, 11.5, 11.95]) {
    p.frame(f0 + b);
    const d = p.c.dance.middle('flugedla').distanceTo(home);
    assert.ok(d <= 0.35, `back on her stand at ${b} (${d.toFixed(2)} m)`);
  }
  // Grameðla: a giant print lit by each of her three giant stomps, all three after the third
  const lit = b => trickOf('gramedla', b / 12).prints.filter(x => x.level > 0.5).length;
  assert.deepEqual([1.9, 2.3, 4.3, 6.3, 11].map(lit), [0, 1, 2, 3, 3]);
  assert.equal(p.c.band.lights(SOLO_OF.gramedla.startBeat + 6.5).prints.filter(x => x.level > 0.5).length, 3);
});

/** The real director cut to a shot on a screen `aspect` wide: is a point in its frame (as hatid-route.test.mjs's)? */
function view(name, aspect) {
  const shot = (aspect < 1 && tallShot(name)) || SHOTS.toppur[name];
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 4000);
  const world = { camera, heightAt: () => TOP_GROUND, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const director = createDirector({ camera, world, shots: {}, lint: false });
  director.cut(shot, { check: false });
  camera.updateMatrixWorld();
  const [w, h] = aspect < 1 ? [800, 1280] : [1280, 800];
  return (point, margin = 0.03) => {
    const v = new THREE.Vector3(...point);
    const ahead = v.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0;
    const q = v.project(camera);
    const x = ((q.x + 1) / 2) * w, y = ((1 - q.y) / 2) * h;
    return ahead && q.z < 1 && x >= margin * w && x <= (1 - margin) * w && y >= Math.max(margin, 0.08) * h && y <= 0.85 * h;
  };
}
const herPoint = (who, ahead, up) => { const s = partyStands()[who]; const a = THREE.MathUtils.degToRad(s.heading); return [s.at[0] + Math.cos(a) * ahead, TOP_GROUND + up, s.at[1] + Math.sin(a) * ahead]; };
const headAt = who => herPoint(who, HEAD[who][0], HEAD[who][1]);
/** What each solo shot must hold at the trick's moments: [shot, solo beat, points]. */
function trickFrames() {
  const T = (who, b) => trickOf(who, b / 12, {}, { ground: TOP_GROUND });
  const lap = b => { const l = lapAt(b); return [l.x, TOP_GROUND + l.lift + 2, l.z]; };
  const top = T('thorsedla', 7).top;
  return [
    ['solo_kambedla', 2, [headAt('kambedla'), herPoint('kambedla', -1.6, 3.2)]],
    ['trick_kambedla', 8, [herPoint('kambedla', 1.15, 3.2), herPoint('kambedla', -1.55, 3)]],
    ['solo_uggedla', 5.4, [headAt('uggedla'), T('uggedla', 5.4).fish[3].at, T('uggedla', 2.8).fish[1].at]],
    ['trick_uggedla', 7.6, [headAt('uggedla'), T('uggedla', 7.6).fish[4].at]],
    ['trick_uggedla', 9, [T('uggedla', 8.95).fish[4].at]],
    ['solo_thorsedla', 3, [T('thorsedla', 3).top]],
    ['trick_thorsedla', 7, [top, [top[0], top[1] + 4, top[2]], [top[0], top[1] - 4, top[2]]]],
    ['solo_flugedla', 1.2, [lap(1.2), headAt('flugedla')]],
    // (fix 1: she flies toward the lens and over it, so her landing at b 10 is behind it)
    ['trick_flugedla', 8, [lap(8)]], ['trick_flugedla', 8.5, [lap(8.5)]], ['trick_flugedla', 9, [lap(9)]],
    ['solo_sloedla', 2, [headAt('sloedla'), herPoint('sloedla', 1.2, 4)]],
    ['trick_sloedla', 9, [headAt('sloedla'), herPoint('sloedla', 1.2, 4)]],
    ['solo_gramedla', 2.5, [headAt('gramedla'), [T('gramedla', 2.5).prints[0].at[0], TOP_GROUND, T('gramedla', 2.5).prints[0].at[1]]]],
    ['trick_gramedla', 7, [headAt('gramedla'), ...T('gramedla', 7).prints.map(x => [x.at[0], TOP_GROUND, x.at[1]])]],
  ];
}

test('a solo shot holds its trick in frame, wide and upright, and no more than three big friends', () => {
  const BIG = FRIENDS8.filter(f => f !== 'egill');
  for (const aspect of [1.6, 0.625]) {
    for (const [name, b, points] of trickFrames()) {
      const seen = view(name, aspect);
      points.forEach((pt, k) => assert.ok(seen(pt), `${name} at ${aspect} holds its trick's point ${k} at solo beat ${b} (${pt.map(v => v.toFixed(1)).join(', ')})`));
      const big = BIG.filter(who => seen(headAt(who), 0));
      assert.ok(big.length <= 3, `${name} at ${aspect}: ${big.join(', ')}`);
    }
    // (fix 1) the hero big at her moment: Flugeðla within 16 m of the lens at b 9
    const l = lapAt(9), lens = ((aspect < 1 && tallShot('trick_flugedla')) || SHOTS.toppur.trick_flugedla).position;
    const far = Math.hypot(l.x - lens[0], TOP_GROUND + l.lift + 1 - lens[1], l.z - lens[2]);
    assert.ok(far <= 16, `Flugeðla ${far.toFixed(1)} m from trick_flugedla's lens at ${aspect}`);
  }
});

test('in a solo the others dance at half the size and look at the soloist', async () => {
  const p = await party();
  const forward = new THREE.Vector3();
  for (const { who: solo, startBeat } of SOLOS.filter(s => s.who !== 'flugedla')) {
    const mid = startBeat + 6; // the same place in the bar as beat 70
    for (const who of FRIENDS8.filter(w => w !== solo)) assert.ok(Math.abs(grooveSize(who, mid) - 0.5) < 0.01, `${who} at half in ${solo}'s solo (${grooveSize(who, mid)})`);
    assert.equal(grooveSize(solo, mid), 1);
    p.frame(70);
    const rest = Object.fromEntries(FRIENDS8.map(w => [w, p.bones[w].get('Head').getWorldQuaternion(new THREE.Quaternion())]));
    p.frame(mid - 0.05);
    p.frame(mid);
    const target = new THREE.Vector3(...headAt(solo)).setY(0);
    for (const who of FRIENDS8.filter(w => w !== solo)) {
      const s = p.stands[who];
      const a = THREE.MathUtils.degToRad(s.heading);
      const ahead = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const head = at(p, who, 'Head').setY(0);
      const to = target.clone().sub(head).normalize();
      const before = deg(ahead.angleTo(to));
      if (before < 25 || before > 140) continue; // (one right behind her she lets go of: hatid-band.js LOOK.past)
      const q = p.bones[who].get('Head').getWorldQuaternion(new THREE.Quaternion());
      forward.copy(ahead).applyQuaternion(rest[who].clone().invert()).applyQuaternion(q).setY(0).normalize();
      const now = deg(forward.angleTo(to));
      assert.ok(now <= before - 8, `${who} looks at ${solo}: ${before.toFixed(0)} degrees off before, ${now.toFixed(0)} now`);
    }
  }
});

test('the band is a function of the beat, and nothing jumps in a frame', async () => {
  const p = await party();
  const snap = () => {
    const out = [];
    for (const who of FRIENDS8) {
      const a = p.c[who].raw;
      out.push(...a.model.position.toArray(), ...a.model.quaternion.toArray(), ...a.root.position.toArray());
      for (const bone of p.bones[who].values()) out.push(...bone.quaternion.toArray(), ...bone.position.toArray());
    }
    for (const mesh of [p.c.band.parts.fish, p.c.band.parts.berries]) out.push(mesh.count, ...mesh.instanceMatrix.array.slice(0, mesh.count * 16));
    const held = p.c.band.parts.held;
    out.push(held.visible ? 1 : 0, ...(held.visible ? [...held.position.toArray(), ...held.quaternion.toArray(), held.scale.x, ...held.morphTargetInfluences] : []));
    out.push(...p.c.plates.levels);
    return out;
  };
  const BEATS = [30.5, 37.2, 61.1, 137.3, 150.2, 157.05, 163.4, 176.6, 181.2, 187.9, 199.1, 202.6, 206.3, 255.4];
  const first = BEATS.map(b => { p.frame(b - 0.4); p.frame(b - 0.2); p.frame(b); return snap(); });
  const again = [...BEATS].reverse().map(b => { p.frame(b + 7); p.frame(b - 0.2); p.frame(b); return snap(); }).reverse();
  first.forEach((s, k) => {
    assert.equal(s.length, again[k].length, `beat ${BEATS[k]}: as many things`);
    s.forEach((v, i) => assert.ok(Math.abs(v - again[k][i]) < 1e-5, `beat ${BEATS[k]}: the same (${v} against ${again[k][i]} at ${i})`));
  });
  const worst = { degrees: 0, metres: 0 };
  let last = null;
  play(p, 26, 210, beat => {
    const now = FRIENDS8.map(who => {
      const a = p.c[who].raw;
      return { who, middle: p.c.dance.middle(who), turn: a.model.quaternion.clone(), root: a.root.position.clone(), bones: [...p.bones[who].values()].map(b => b.quaternion.clone()) };
    });
    if (last) {
      now.forEach((n, k) => {
        const l = last[k];
        // (Flugeðla's lap is a flight: her body's middle may go a metre a frame in it)
        const most = n.who === 'flugedla' && inSolo('flugedla', beat) ? 1 : 0.2;
        const metres = (Math.max(n.middle.distanceTo(l.middle), n.root.distanceTo(l.root)) / most) * 0.2;
        const degrees = Math.max(deg(n.turn.angleTo(l.turn)), ...n.bones.map((q, i) => deg(q.angleTo(l.bones[i]))));
        if (degrees > worst.degrees) Object.assign(worst, { degrees, where: `${n.who} at ${beat.toFixed(2)}` });
        if (metres > worst.metres) Object.assign(worst, { metres, whereM: `${n.who} at ${beat.toFixed(2)}` });
      });
    }
    last = now;
  });
  assert.ok(worst.degrees <= 12, `${worst.degrees.toFixed(1)} degrees in a frame (${worst.where})`);
  assert.ok(worst.metres <= 0.2, `${worst.metres.toFixed(3)} (scaled) m in a frame (${worst.whereM})`);
});

// ---------------------------------------------------------------------------------------------
// The end of the party (Task 17; spec 6 "Kyrra stundin", "Síðasta viðlagið", "Lokahljómur", "Myndavélin"): the quiet moment, the last
// chorus with its shooting stars, northern lights, roars and the moon, the end pose on the chord, and the camera's final cut.
const sectionOf = id => SONG.song.sections.find(s => s.id === id);
const QUIET = sectionOf('quiet'), CHORUS = sectionOf('chorus'), CHORD = sectionOf('chord');
const span = (from, to, step, fn) => { for (let b = from; b < to - 1e-9; b += step) fn(b); };

test('the quiet part: no spotlight, no stomp, the constellations breathe and the moon rocks', () => {
  const from = QUIET.startBeat, to = from + QUIET.beats;
  assert.deepEqual(cuesIn('stomp', from, to), [], 'no stomp cue in it');
  const breaths = [], sways = [], eyes = new Set();
  span(from, to, 0.125, b => {
    for (const s of spotsAt(b)) assert.equal(s.level, 0, `no spotlight at ${b}`);
    const j = joltAt(b);
    assert.ok(!j.y && !j.pitch, `no tremble at ${b}`);
    breaths.push([b, breathAt(b)]);
    const m = moonAt(b);
    sways.push([b, m.sway]);
    eyes.add(m.eye);
  });
  // one breath in four bars, in and out, none outside the quiet part
  assert.ok(breaths.some(([, v]) => v > 0.8) && breaths.some(([b, v]) => b > from + 4 && b < to - 4 && v < 0.1), 'it breathes in and out');
  const peaks = breaths.filter(([, v], k) => k > 0 && k < breaths.length - 1 && v > breaths[k - 1][1] && v >= breaths[k + 1][1] && v > 0.3).map(([b]) => b);
  assert.ok(peaks.length >= 2, `${peaks.length} breaths`);
  for (let k = 1; k < peaks.length; k++) assert.ok(Math.abs(peaks[k] - peaks[k - 1] - BREATH.beats) < 0.5, `a breath every ${BREATH.beats} beats (${peaks.join(', ')})`);
  for (const b of [from - 1, to + 1, 100, 300]) assert.equal(breathAt(b), 0, `no breath at ${b}`);
  // the moon rocks slowly and blinks
  const most = Math.max(...sways.map(([, s]) => Math.abs(s)));
  assert.ok(most >= 4, `the moon rocks ${most.toFixed(1)} degrees in the quiet part`);
  let turns = 0;
  for (let k = 2; k < sways.length; k++) if (Math.sign(sways[k][1] - sways[k - 1][1]) !== Math.sign(sways[k - 1][1] - sways[k - 2][1])) turns++;
  assert.ok(turns <= QUIET.beats / 3, `slowly: ${turns} turns in ${QUIET.beats} beats`);
  assert.ok(eyes.has('shut'), 'it blinks');
});

test('in the quiet part Egill and Mosi look up as the fireflies gather and rise, and down again by the last chorus (Task 17 fix 1)', async () => {
  const p = await party();
  const head = (who, b) => { p.frame(b - 0.05); p.frame(b); return p.bones[who].get('Head').getWorldQuaternion(new THREE.Quaternion()); };
  // the same place in the bar (the groove sways with it), before the look and in it
  const pairs = { egill: 15, mosi: 12 };
  for (const [who, most] of Object.entries(pairs)) {
    const before = head(who, LOOK_UP.from - 3.5), up = head(who, LOOK_UP.from + 12.5);
    assert.ok(deg(up.angleTo(before)) >= most, `${who} looks up (${deg(up.angleTo(before)).toFixed(0)} degrees)`);
  }
  assert.equal(lookUpAt(LOOK_UP.from + 8), 1, 'up through the gathering and the rise');
  for (const b of [LOOK_UP.from - 0.01, LOOK_UP.to, LOOK_UP.to + 40, 100]) assert.equal(lookUpAt(b), 0, `not looking up at ${b}`);
  assert.ok(FIREFLY_QUIET.at.gather >= LOOK_UP.from && FIREFLY_QUIET.at.gather < LOOK_UP.from + 4, 'they look up as the gathering begins');
});

test('the last chorus is the biggest: more light than any part before it (the stage\'s state summed), every burst on its cue in a friend\'s hue, the northern lights up', () => {
  const mean = id => { const s = sectionOf(id); let sum = 0, n = 0; span(s.startBeat, s.startBeat + s.beats, 0.25, b => { sum += stageLightAt(b); n++; }); return sum / n; };
  const chorus = mean('chorus');
  for (const id of ['intro', 'dance', 'solos', 'quiet']) assert.ok(chorus > mean(id) * 1.15, `the chorus ${chorus.toFixed(2)} against ${id} ${mean(id).toFixed(2)}`);
  assert.ok(mean('quiet') < mean('dance') / 2, 'the quiet part is plainly quiet');
  assert.ok(stageLightAt(CHORUS.startBeat + 0.25) > mean('dance'), 'everything on at its first beat');
  // the bursts: a volley on each burst cue, in flight for two beats before it and bursting on it, the six hues each time
  const cues = cuesIn('burst', -Infinity, Infinity).map(c => c.beat);
  assert.equal(cues.length, 4);
  const six = new Set(SIX.map(who => FRIEND_HUES[who]));
  cues.forEach(cue => {
    const flying = skyBurstsAt(cue - 1);
    assert.equal(flying.length, SKY_BURSTS.per);
    assert.ok(flying.every(s => s.burst === 0 && Math.abs(s.u - 0.5) < 1e-9), `in flight a beat before ${cue}`);
    assert.ok(skyBurstsAt(cue - SKY_BURSTS.cross - 0.01).every(s => s.cue !== cue), 'not before its two beats');
    const bursting = skyBurstsAt(cue + 0.01);
    assert.ok(bursting.every(s => s.burst > 0 && s.burst < 0.01), `bursting on its cue ${cue}`);
    assert.equal(new Set(bursting.map(s => s.colour)).size, SKY_BURSTS.per, 'each in its own hue');
    assert.ok(bursting.every(s => six.has(s.colour)), 'a friend\'s');
  });
  assert.equal(new Set(cues.map(cue => skyBurstsAt(cue + 0.01)[0].who)).size, cues.length, 'each volley led by another friend');
  span(0, END_TAIL, 0.125, b => assert.ok(skyBurstsAt(b).length <= NIGHT.shooting, `never more than ${NIGHT.shooting} at once (${b})`));
  span(0, CHORUS.startBeat, 0.5, b => assert.equal(skyBurstsAt(b).length, 0, `no shooting star before the chorus (${b})`));
  // the northern lights: none before the chorus, up over its first bar, full through it, down over the chord
  span(0, CHORUS.startBeat, 0.5, b => assert.equal(auroraAt(b).level, 0, `no northern lights at ${b}`));
  const rising = auroraAt(CHORUS.startBeat + 2).level;
  assert.ok(rising > 0.3 && rising < 0.9, `coming up over its first bar (${rising.toFixed(2)})`);
  span(CHORUS.startBeat + 4, CHORD.startBeat, 0.5, b => assert.ok(auroraAt(b).level > 0.99, `up at ${b}`));
  assert.ok(auroraAt(CHORD.startBeat + CHORD.beats - 0.01).level < 0.01, 'gone with the chord');
});

test('Grameðla roars on the map\'s roar cues, and the moon\'s hat is askew after each and straight again within two bars', async () => {
  const p = await party();
  const jaw = () => p.bones.gramedla.get('Jaw').quaternion.clone();
  const cues = cuesIn('roar', -Infinity, Infinity).map(c => c.beat);
  assert.equal(cues.length, 4);
  for (const cue of cues) {
    assert.ok(cue >= CHORUS.startBeat && cue < CHORD.startBeat, `${cue} in the last chorus`);
    p.frame(cue - 2.05); p.frame(cue - 2);
    const shut = jaw();
    const head = p.bones.gramedla.get('Head').getWorldQuaternion(new THREE.Quaternion());
    p.frame(cue - 0.05); p.frame(cue + 0.5);
    const open = deg(jaw().angleTo(shut));
    assert.ok(open >= 25, `her jaws wide on the roar at ${cue} (${open.toFixed(0)} degrees)`);
    const lifted = deg(p.bones.gramedla.get("Head").getWorldQuaternion(new THREE.Quaternion()).angleTo(head));
    assert.ok(lifted >= 25, `her head up at the sky at ${cue} (turned ${lifted.toFixed(0)} degrees)`);
    p.frame(cue + 4.95); p.frame(cue + 5);
    assert.ok(deg(jaw().angleTo(shut)) < 15, `shut again by ${cue + 5}`);
    assert.equal(roarAt(cue).k, 1);
    // the moon: knocked askew by it, put right by its hand inside two bars
    assert.ok(moonAt(cue - 0.5).hat < 12, `its hat straight before ${cue} (${moonAt(cue - 0.5).hat.toFixed(1)})`);
    assert.ok(moonAt(cue + 0.5).hat >= 20, `askew after the roar at ${cue} (${moonAt(cue + 0.5).hat.toFixed(0)})`);
    assert.equal(moonAt(cue + MOON_FINALE.fix + 0.5).hand.kind, 'hat', 'its hand on it');
    const later = moonAt(cue + 8.5).hat;
    assert.ok(later < 8, `straight again within two bars of ${cue} (${later.toFixed(1)})`);
  }
  // through the chorus it rocks on the beat with its hand on its hat
  span(CHORUS.startBeat + 1, CHORD.startBeat - 1, 0.5, b => assert.equal(moonAt(b).hand.kind, 'hat', `its hand on its hat at ${b}`));
  let rock = 0;
  span(CHORUS.startBeat + 8, CHORUS.startBeat + 12, 0.125, b => { rock = Math.max(rock, Math.abs(moonAt(b).sway)); });
  assert.ok(rock >= 6, `rocking on the beat (${rock.toFixed(1)} degrees)`);
});

test('on the chord everyone holds her end pose from its first beat to the end of the tail, and the stage\'s light is under a tenth of its most when the tail ends', async () => {
  const p = await party();
  const snap = () => Object.fromEntries(FRIENDS8.map(who => [who, [...p.bones[who].values()].map(b => b.quaternion.clone())]));
  p.frame(209.95); p.frame(210);
  const snout = () => at(p, 'sloedla', 'Jaw').y - at(p, 'sloedla', 'Head').y;
  const slow = snout(); // her snout in the quiet part
  p.frame(CHORD.startBeat - 0.05);
  p.frame(CHORD.startBeat);
  assert.equal(p.c.band.state().ending, true);
  const first = snap();
  for (const hand of ['LeftHand', 'RightHand']) assert.ok(at(p, 'egill', hand).y > at(p, 'egill', 'Head').y, `Egill's ${hand} up`);
  assert.ok(snout() - slow >= 0.15, `Slóeðla's horn up (her snout ${(snout() - slow).toFixed(2)} m higher than in the quiet part)`);
  assert.ok(at(p, 'thorsedla', 'Head').y > 9, `Þórseðla's head high (${at(p, 'thorsedla', 'Head').y.toFixed(1)} m)`);
  for (const b of [CHORD.startBeat + 0.5, CHORD.startBeat + 4.3, 356.7, 361.2, 363.6, END_TAIL - 0.05]) {
    p.frame(b - 0.05); p.frame(b);
    const now = snap();
    for (const who of FRIENDS8) {
      const most = Math.max(...now[who].map((q, i) => deg(q.angleTo(first[who][i]))));
      assert.ok(most < 2, `${who} holds her end pose at ${b} (${most.toFixed(1)} degrees)`);
    }
  }
  let most = 0;
  span(0, END_TAIL, 0.25, b => { most = Math.max(most, stageLightAt(b)); });
  const end = stageLightAt(END_TAIL - 0.01);
  assert.ok(end < most / 10, `the light ${end.toFixed(2)} when the tail ends (its most ${most.toFixed(2)})`);
  assert.ok(stageLightAt(CHORD.startBeat + 2) > most / 3, 'still lit as the chord begins');
  p.frame(299.9); p.frame(300); // a seek back gives everyone back to the dance
  assert.equal(p.c.band.state().ending, false);
});

// The final cut, as kafli5-video.test.mjs's camera tests
const PEAK = Math.PI / 2; // a move eased in and out is this much faster in its middle than on average
const lastsOf = k => (CAMERA[k + 1]?.beat ?? END_BEAT) - CAMERA[k].beat;
const CALLS = SONG.song.calls;

test('the camera is cut to the song: every cut on a beat, a bar or more but for the quick ones, none in a call\'s gap, every solo close, every wide shot inside the budget', () => {
  CAMERA.forEach((entry, k) => {
    assert.ok(SHOTS.toppur[entry.cut], `${entry.cut} is a shot`);
    assert.ok(Number.isInteger(entry.beat), `the cut at ${entry.beat} on a beat`);
    if (k > 0) {
      assert.ok(entry.beat > CAMERA[k - 1].beat, `cut ${k} after the one before`);
      assert.notEqual(entry.cut, CAMERA[k - 1].cut, `the cut at ${entry.beat} is to another shot`);
    }
    const beats = lastsOf(k);
    assert.equal(Boolean(entry.quick), beats < 4, `the shot at ${entry.beat} lasts ${beats} beats: quick says so, and only then`);
    if (entry.quick) {
      assert.ok(entry.beat >= CHORUS.startBeat && entry.beat + beats <= CHORD.startBeat, `the quick shot at ${entry.beat} is in the last chorus`);
      assert.equal(beats, 2, `the quick shot at ${entry.beat} is two beats`);
      assert.equal(entry.then, undefined, 'and stands still');
    }
    if (BUDGET.wide.includes(entry.cut)) assert.ok(beats <= BUDGET.wideBars * 4, `${entry.cut} at ${entry.beat} holds ${beats} beats`);
  });
  for (const call of CALLS) {
    assert.ok(!CAMERA.some(e => e.beat > call.beat && e.beat < call.doBeat), `no cut inside the gap of ${call.move} at ${call.beat}`);
    const held = CAMERA.filter(e => e.beat <= call.beat).at(-1);
    assert.ok(SHOWS[held.cut].includes('sloedla'), `Slóeðla is in ${held.cut} as she calls at ${call.beat}`);
  }
  for (const { who, startBeat, beats } of SOLOS) {
    const cuts = CAMERA.filter(e => e.beat >= startBeat && e.beat < startBeat + beats).map(e => e.cut);
    assert.deepEqual(cuts, [`solo_${who}`, `trick_${who}`], `${who}'s solo is close`);
  }
  // the quiet part is a small story (Task 17 fix 1), two bars a shot or more: everyone, Slóeðla's horn to the sky, the moon, Egill and
  // Mosi as the fireflies gather behind them, the fireflies' rise with the one push
  const quiet = CAMERA.filter(e => e.beat >= QUIET.startBeat && e.beat < QUIET.startBeat + QUIET.beats);
  assert.deepEqual(quiet.map(e => e.cut), ['quiet_wide', 'trick_sloedla', 'moon_close', 'quiet_egill', 'sky_dance']);
  quiet.forEach(e => assert.ok(lastsOf(CAMERA.indexOf(e)) >= 8, `${e.cut} at ${e.beat} holds two bars or more`));
  const holding = b => CAMERA.filter(e => e.beat <= b).at(-1).cut;
  assert.equal(holding(cuesIn('horn', QUIET.startBeat, QUIET.startBeat + QUIET.beats)[0].beat), 'trick_sloedla', 'her horn to the sky, close');
  assert.equal(holding(FIREFLY_QUIET.at.rise - 1), 'quiet_egill', 'the fireflies gather behind Egill and Mosi');
  assert.equal(holding(FIREFLY_QUIET.at.rise + FIREFLY_QUIET.spread + 1), 'sky_dance', 'and rise in the sky');
  assert.ok(quiet.filter(e => e.then).length === 1 && quiet.at(-1).then?.push > 0, 'one slow push, on the rise');
  // the sky is in frame for the volleys' bursts: chorus_sky holds each burst cue, with every burst of it in frame at both sizes
  const cues = cuesIn('burst', -Infinity, Infinity).map(c => c.beat);
  for (const cue of cues) assert.equal(CAMERA.filter(e => e.beat <= cue + 0.5).at(-1).cut, 'chorus_sky', `the sky on the burst at ${cue}`);
  for (const aspect of [1.6, 0.625]) {
    const seen = view('chorus_sky', aspect);
    const lens = ((aspect < 1 && tallShot('chorus_sky')) || SHOTS.toppur.chorus_sky).position;
    for (const b of skyBurstsAt(cues[0] + 0.5)) {
      const v = skyDirection(b.to[0], b.to[1]).multiplyScalar(400).add(new THREE.Vector3(...lens));
      assert.ok(seen(v.toArray(), 0.04), `the ${b.who} burst in chorus_sky at ${aspect}`);
    }
  }
  // the band close in the dance and the last chorus (ruling 18): Grameðla's drum, Kambeðla's lizards, Flugeðla at her deck
  const band = new Set(CAMERA.filter(e => (e.beat >= 72 && e.beat < 136) || (e.beat >= CHORUS.startBeat && e.beat < CHORD.startBeat)).map(e => e.cut));
  for (const shot of ['solo_gramedla', 'trick_kambedla', 'solo_flugedla']) assert.ok(band.has(shot), `${shot} in the dance or the chorus`);
});

/** Egill's bones, the top of his head and his soles, on the shots' ground (the harness stands everyone on 0, the shots on 1.2). */
function egillPoints(p) {
  const lift = new THREE.Vector3(0, TOP_GROUND, 0);
  const out = [...p.bones.egill.values()].map(b => b.getWorldPosition(new THREE.Vector3()).add(lift));
  out.push(at(p, 'egill', 'Head').add(lift).add(new THREE.Vector3(0, 0.18, 0)));
  return out;
}
const LENSES = new Map();
/** The director's camera on `name` at `aspect` (as view), to project with. */
function lensOf(name, aspect) {
  const key = `${name} ${aspect}`;
  if (LENSES.has(key)) return LENSES.get(key);
  const shot = (aspect < 1 && tallShot(name)) || SHOTS.toppur[name];
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 4000);
  const world = { camera, heightAt: () => TOP_GROUND, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  createDirector({ camera, world, shots: {}, lint: false }).cut(shot, { check: false });
  camera.updateMatrixWorld();
  LENSES.set(key, camera);
  return camera;
}

test('Egill is in frame, whole, for four dance beats or more of each called move', async () => {
  const p = await party();
  const worst = {};
  for (const call of CALLS) {
    for (const aspect of [1.6, 0.625]) {
      const least = aspect < 1 ? 0.2 : 0.25;
      let held = 0, run = 0, why = '';
      play(p, call.doBeat, call.doBeat + 8 * DANCE_BEAT, beat => {
        const entry = CAMERA.filter(e => e.beat <= beat + 1e-9).at(-1);
        const camera = lensOf(entry.cut, aspect);
        const pts = egillPoints(p).map(v => v.project(camera));
        const whole = pts.every(q => q.z < 1 && Math.abs(q.x) <= 0.97 && q.y <= 0.84 && q.y >= -0.97);
        const tall = (Math.max(...pts.map(q => q.y)) - Math.min(...pts.map(q => q.y))) / 2;
        const mosi = at(p, 'mosi', 'Head').add(new THREE.Vector3(0, TOP_GROUND, 0)).project(camera);
        const friend = mosi.z < 1 && Math.abs(mosi.x) <= 1 && Math.abs(mosi.y) <= 1;
        const key = `${aspect}`;
        if (!worst[key] || tall < worst[key].tall) worst[key] = { tall, at: `${call.move} ${beat.toFixed(2)} ${entry.cut}` };
        if (whole && tall >= least && friend) { run += FRAME / BEAT; held = Math.max(held, run); } else { run = 0; why ||= `${beat.toFixed(2)} in ${entry.cut}: whole ${whole} (x ${Math.min(...pts.map(q => q.x)).toFixed(2)}..${Math.max(...pts.map(q => q.x)).toFixed(2)}, y ${Math.min(...pts.map(q => q.y)).toFixed(2)}..${Math.max(...pts.map(q => q.y)).toFixed(2)}), ${(tall * 100).toFixed(0)} % tall, Mosi ${friend}`; }
      });
      assert.ok(held >= 4 * DANCE_BEAT - 0.1, `${call.move} at ${call.beat}: Egill whole, big and with Mosi for ${held.toFixed(1)} song beats at ${aspect} (first miss: ${why})`);
    }
  }
});

test('every move of the camera is slow enough for the style and over before the next cut', () => {
  const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  CAMERA.forEach((entry, k) => {
    if (!entry.then) return;
    const { then } = entry;
    const next = CAMERA[k + 1]?.beat ?? END_TAIL;
    assert.ok(then.beats > 0 && entry.beat + then.beats <= next, `the move at ${entry.beat} ends by the cut at ${next}`);
    const seconds = then.beats * BEAT;
    assert.ok(seconds >= 1.5, `the move at ${entry.beat} takes ${seconds.toFixed(2)} s`);
    const shot = SHOTS.toppur[entry.cut];
    if (then.push !== undefined) {
      assert.ok((Math.abs(then.push) / seconds) * PEAK <= 1.2, `the push at ${entry.beat}`);
      assert.ok(Math.abs(then.push) < far(shot.position, shot.target), 'never through what it looks at');
    } else if (then.orbit !== undefined) assert.ok((Math.abs(then.orbit) / seconds) * PEAK <= 10, `the orbit at ${entry.beat}`);
    else if (then.zoom !== undefined) assert.ok(then.zoom >= 24 && then.zoom <= 60 && (Math.abs(then.zoom - shot.fov) / seconds) * PEAK <= 8, `the zoom at ${entry.beat}`);
    else assert.fail(`the move at ${entry.beat} is a push, an orbit or a zoom`);
  });
  assert.ok(CAMERA.some(e => e.beat >= QUIET.startBeat && e.beat < QUIET.startBeat + QUIET.beats && e.cut === 'sky_dance' && e.then?.push), 'the quiet part\'s one slow push, on the rise');
});

test('reduced: bursts are glows, the northern lights stand, the camera only cuts', () => {
  const cue = cuesIn('burst', -Infinity, Infinity)[0].beat;
  assert.deepEqual(skyBurstsAt(cue - 1, { reduced: true }), [], 'nothing in flight');
  const glows = skyBurstsAt(cue + 0.5, { reduced: true });
  assert.equal(glows.length, SKY_BURSTS.per);
  const sky = createNightSky(emptyWorld(), { reduced: true });
  sky.shoot(glows);
  const drawn = sky.group.getObjectByName('NightShooting').geometry.drawRange.count;
  assert.equal(drawn, SKY_BURSTS.per, `${drawn} points: a glow a burst`);
  const full = createNightSky(emptyWorld(), { reduced: false });
  full.shoot(skyBurstsAt(cue + 0.5));
  assert.ok(full.group.getObjectByName('NightShooting').geometry.drawRange.count >= SKY_BURSTS.per * 20, 'and sparks without it');
  // the northern lights stand: the same ribbons at two times of the song
  const ribbons = () => [...sky.group.getObjectByName('NightLights').geometry.getAttribute('position').array];
  sky.aurora(auroraAt(270).level, auroraAt(270).time);
  const a = ribbons();
  sky.aurora(auroraAt(290).level, auroraAt(290).time);
  assert.deepEqual(ribbons(), a, 'still');
  sky.dispose?.(); full.dispose?.();
  // the camera only cuts: the chapter skips each shot's `then` when reduced (hatid.js; its run is checked in hatid.test.mjs), and
  // CAMERA has no other way to move the lens
  assert.ok(CAMERA.every(e => Object.keys(e).every(k => ['beat', 'cut', 'then', 'quick'].includes(k))));
});

test('never two lifts or bursts of light inside half a second', () => {
  // every flash of the party: the spotlights' fireworks (hit cues), the shooting stars bursting, the party light's lifts; those on the
  // same instant count once (chunk-6 ruling 5)
  const onsets = [];
  const hits = new Set(), bursts = new Set();
  let lifted = false;
  span(0, END_TAIL, FRAME / BEAT, b => {
    for (const f of fireworksAt(b)) if (!hits.has(f.hit)) { hits.add(f.hit); onsets.push(['fireworks', f.hit]); }
    for (const s of skyBurstsAt(b)) if (s.burst > 0 && !bursts.has(s.cue)) { bursts.add(s.cue); onsets.push(['burst', s.cue]); }
    const lift = partyLook(b).lift;
    if (lift > 0.2 && !lifted) onsets.push(['lift', b]);
    lifted = lift > 0.05;
  });
  for (const kind of ['burst', 'fireworks', 'lift']) assert.ok(onsets.some(o => o[0] === kind), `a ${kind} in the party`);
  const times = [...new Set(onsets.map(([, b]) => Math.round(b * 4) / 4))].sort((x, y) => x - y).map(b => b * BEAT);
  for (let k = 1; k < times.length; k++) assert.ok(times[k] - times[k - 1] >= 0.5, `two flashes ${(times[k] - times[k - 1]).toFixed(2)} s apart at ${(times[k] / BEAT).toFixed(2)}`);
});
