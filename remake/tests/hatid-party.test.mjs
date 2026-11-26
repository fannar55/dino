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
import { BEAT, callAt, cuesIn } from '../chapters/hatid-score.js';
import { SONG } from '../chapters/hatid-song.js';
import { floorAt } from '../chapters/hatid-stage.js';
import { createDance, moveOf, grooveOf, moveAt, MOVES, CALL_LINE, HOP } from '../chapters/hatid-dance.js';
import { loadCharacter, emptyWorld } from './characters.mjs';

const FRAME = 1 / 30;
const DANCE_BEAT = SONG.danceBeats; // song beats a dance beat
const SIX = FRIENDS.map(f => f.key);
const deg = THREE.MathUtils.radToDeg;

/** The eight at their party stands, their six drawings at their party places (held in their traced pose, as scene 2 leaves them). */
let made = null;
function party() {
  made ??= (async () => {
    const world = emptyWorld();
    const stands = partyStands();
    const c = { world, reduced: false, stands: { party: stands } };
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
    c.dance = createDance(c);
    const bones = Object.fromEntries(FRIENDS8.map(who => [who, new Map()]));
    for (const who of FRIENDS8) c[who].raw.model.traverse(o => { if (o.isBone && !bones[who].has(o.name)) bones[who].set(o.name, o); });
    const frame = beat => {
      c.partyBeat = beat;
      c.dance.update(beat);
      for (const who of FRIENDS8) c[who].raw.update(FRAME);
      for (const who of FRIENDS8) c[who].raw.root.updateMatrixWorld(true);
    };
    return { world, c, stands, bones, frame };
  })();
  return made;
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

test('Grameðla\'s stomp lands on the beat, within a frame', async () => {
  const p = await party();
  for (const call of SONG.song.calls.filter(c => c.move === 'stomp')) {
    const [from, to] = moveSpan(call);
    const landings = [];
    const FEET2 = ['LeftFoot', 'RightFoot'];
    const was = [0, 0];
    p.frame(from - 1);
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
          if (degrees > worst.degrees) Object.assign(worst, { degrees, where: `${n.who} at ${beat.toFixed(2)}` });
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
