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
import { BEAT, CAMERA, callAt, cuesIn, soloAt } from '../chapters/hatid-score.js';
import { SONG } from '../chapters/hatid-song.js';
import { floorAt, spotsAt } from '../chapters/hatid-stage.js';
import { createDance, moveOf, grooveOf, grooveSize, moveAt, MOVES, CALL_LINE, HOP } from '../chapters/hatid-dance.js';
import { createBand, ROLES, roleOf, SOLO_TRICKS, trickOf, lapAt, DECK } from '../chapters/hatid-band.js';
import { SHOTS, HEAD, LENGTH, tallShot } from '../chapters/hatid-route.js';
import { createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';
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
    assert.deepEqual(cuts.map(c => [c.beat - startBeat, c.cut]), [[0, `solo_${who}`], [6, `trick_${who}`]], `${who}'s shots`);
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
  const jawFish = () => {
    const jaw = at(p, 'uggedla', 'Jaw');
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    let best = Infinity;
    for (let i = 0; i < fish.count; i++) { fish.getMatrixAt(i, m); best = Math.min(best, v.setFromMatrixPosition(m).distanceTo(jaw)); }
    return best;
  };
  for (const b of [9, 9.5, 10.5]) {
    p.frame(u0 + b - 0.05);
    p.frame(u0 + b);
    assert.ok(jawFish() <= 2.2, `a fish in her jaws at ${b}: across her snout, ${jawFish().toFixed(2)} m from its hinge`);
  }
  p.frame(u0 + 11.8);
  assert.equal(fish.count, 0, 'gulped');
  for (const b of [1.5, 3, 5.5, 7.5]) { p.frame(u0 + b); assert.ok(fish.count >= 1, `a fish in the air at ${b}`); }
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
    ['trick_flugedla', 7, [lap(7)]], ['trick_flugedla', 8.5, [lap(8.5)]], ['trick_flugedla', 10, [lap(10)]],
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
