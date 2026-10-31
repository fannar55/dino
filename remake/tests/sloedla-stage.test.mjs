// The menu's stage in Slóeðla's song game (engine/sloedla/stage-motion.js): the friends answer the child's picks, dance on the
// beat of the picked song's preview, and the loading ring never runs ahead of the song or flashes by.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CAST, bounce, castLayout, clipTime, loadingDone, loopBeats, reactions, ringStep, RING_MIN } from '../engine/sloedla/stage-motion.js';

/** The names of the animations in a .glb (its JSON chunk). */
function clipNamesOf(url) {
  const bytes = fs.readFileSync(url);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  return (json.animations ?? []).map(animation => animation.name);
}

test('the friends hop on every beat and rest the second half of it', () => {
  assert.equal(bounce(0), 0);
  assert.ok(Math.abs(bounce(0.25) - 1) < 1e-9 && Math.abs(bounce(3.25) - 1) < 1e-9);
  assert.ok(bounce(0.5) < 1e-9 && bounce(0.75) === 0);
});

test('a dance move spans 1, 2, 4 or 8 beats, as near its own length as can be, and starts on the beat', () => {
  assert.equal(loopBeats(1.1, 150), 2); // Egill's hop at Rokkhopp
  assert.equal(loopBeats(2.4, 95), 4); // a happy dance at Fönkhopp
  assert.equal(loopBeats(0.1, 120), 1);
  assert.equal(loopBeats(30, 60), 8);
  assert.deepEqual([0, 2, 4, 5].map(b => clipTime(b, 4, 2.4)), [0, 1.2, 0, 0.6]);
});

test('the loading ring: never ahead of the song, never full before a second and a half, never a jump, never back', () => {
  let shown = 0;
  let t = 0;
  while (shown < 1 && t < 5) {
    const next = ringStep(shown, 1, 0.1);
    assert.ok(next - shown <= 0.1 / RING_MIN + 1e-9);
    shown = next;
    t += 0.1;
  }
  assert.ok(t >= RING_MIN - 1e-9, `full after ${t.toFixed(1)} s`);
  assert.equal(ringStep(0, 0.3, 1), 0.3, 'not ahead of what has come');
  assert.equal(ringStep(0.5, 0.4, 0.1), 0.5, 'never back');
  assert.equal(ringStep(1, 1, 0), 1, 'again: full at once');
});

test('"Byrjum!" waits for the DJ to finish, and for nobody when he is silent', () => {
  assert.equal(loadingDone({ shown: 1, now: 2, talkUntil: 2.4 }), false);
  assert.equal(loadingDone({ shown: 1, now: 2.5, talkUntil: 2.4 }), true);
  assert.equal(loadingDone({ shown: 0.9, now: 9, talkUntil: 0 }), false);
  assert.equal(loadingDone({ shown: 1, now: 0.2, talkUntil: 0 }), true);
});

test('the stage answers the picks: Fullorðinn, Egill sits in the dark; 2 eðlur, Kambeðla eats in the dark; the others cheer', () => {
  const by = list => Object.fromEntries(list.map(reaction => [reaction.id, reaction]));
  assert.deepEqual(reactions(null, { lanes: 3, level: 'barn' }), []);
  const two = by(reactions({ lanes: 3, level: 'barn' }, { lanes: 2, level: 'barn' }));
  assert.deepEqual(two.b, { id: 'b', clip: 'eat', once: false, out: true });
  assert.equal(two.egill, undefined);
  assert.deepEqual([two.a.clip, two.c.clip], ['call', 'happy']);
  const grown = by(reactions({ lanes: 2, level: 'barn' }, { lanes: 2, level: 'fullordinn' }));
  assert.deepEqual(grown.egill, { id: 'egill', clip: 'sit', once: false, out: true });
  const back = by(reactions({ lanes: 2, level: 'fullordinn' }, { lanes: 3, level: 'barn' }));
  assert.deepEqual([back.egill.clip, back.b.clip, back.b.out], ['wave', 'happy', false]);
});

test('on an upright screen the friends stand closer, Egill in front', () => {
  const wide = castLayout(false);
  const tall = castLayout(true);
  for (const id of ['b', 'a', 'c']) assert.ok(Math.abs(tall[id].x - wide[id].x * 0.56) < 1e-9, id);
  assert.deepEqual(tall.egill, { x: -1.15, z: 2.6 });
});

test('with no WebGL the stage is null, so the page shows the friends as pictures', async () => {
  const { createStage } = await import('../engine/sloedla/stage.js');
  assert.equal(await createStage({ canvas: {}, asset: path => path, win: { devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 } }), null);
});

test('every friend on the stage is on disk with every move the stage asks of her', () => {
  for (const [id, friend] of Object.entries(CAST)) {
    const names = clipNamesOf(new URL(`../assets/characters/${friend.file}.glb`, import.meta.url));
    for (const clip of [friend.rest, friend.cheer, friend.away, friend.dance]) assert.ok(names.includes(clip), `${id} ${friend.file}: ${clip}`);
  }
});
