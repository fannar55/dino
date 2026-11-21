// What the pond show's timeline promises (chapters/tjorn3d/show.js; the plan's section 4): the six parts in order at their
// seconds, the long hold at the head, the calm pond as the last picture, and that nothing comes or goes where it could pop.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTS, CALM, LENGTH, FADE, HOLD, HEAD, DEEP, TURN, SAIL, GONE, JUMP, FISH, BUTTERFLY_TIMES, RINGS, BUBBLES, BUBBLE, SPLASHES, RUNOFF, DROPS,
  GRAVITY, partAt, herAt, jumperAt, fishAt, butterflyAt, channel,
} from '../chapters/tjorn3d/show.js';

test('the six parts are the plan\'s, in order and at its seconds, and the calm pond closes the show', () => {
  assert.deepEqual(PARTS.map(p => [p.id, p.name, p.from, p.to]), [
    [1, 'Kyrr tjörn', 0, 8], [2, 'Skugginn', 8, 20], [3, 'Seglið', 20, 30], [4, 'Höfuðið', 30, 42], [5, 'Fiskurinn', 42, 50], [6, 'Fiðrildið', 50, 60],
  ]);
  PARTS.slice(1).forEach((p, i) => assert.equal(p.from, PARTS[i].to, `part ${p.id} starts where part ${PARTS[i].id} ends`));
  assert.equal(CALM.from, PARTS.at(-1).to);
  assert.equal(LENGTH, CALM.to);
  assert.ok(LENGTH >= 58 && LENGTH <= 66, `about a minute: ${LENGTH} s`);
  assert.ok(CALM.to - CALM.from >= 1 + FADE.out, 'the calm pond is there for a second before the dip to black');
  assert.equal(partAt(0).id, 1);
  assert.equal(partAt(36).id, 4);
  assert.equal(partAt(59.99).id, 6);
  assert.equal(partAt(61), null);
});

test('a channel holds its ends and eases between its rows', () => {
  const c = channel([[1, 10], [3, 20, 'lin'], [5, 0, 'out']]);
  assert.equal(c(0), 10);
  assert.equal(c(2), 15);
  assert.equal(c(3), 20);
  assert.equal(c(9), 0);
  assert.ok(c(4) < 10, 'out: most of the way early');
});

test('the head: up at 6,5 cm in key 4b\'s place, and held still for three seconds or more', () => {
  assert.ok(HOLD.from >= 30 && HOLD.to <= 42, 'inside part 4');
  assert.ok(HOLD.to - HOLD.from >= 3, `${HOLD.to - HOLD.from} s`);
  assert.equal(HEAD.top, 6.5);
  for (let t = HOLD.from; t <= HOLD.to; t += 0.25) {
    const h = herAt(t);
    assert.deepEqual([h.at, h.sink, h.pitch, h.heading, h.jaw, h.strike, h.toss], [HEAD.at, HEAD.sink, HEAD.pitch, HEAD.heading, 0, 0, 0], `still at ${t}`);
    assert.equal(h.look, 'eye', `she looks at the viewer at ${t}`);
  }
});

test('she comes from the deep and goes back to it: never there before the shadow, never popping in or out', () => {
  assert.equal(herAt(4).there, false);
  assert.equal(herAt(LENGTH - 1).there, false);
  for (const t of [8, TURN, TURN + 0.2, GONE]) assert.ok(herAt(t).sink >= DEEP - 1e-9, `deep at ${t}`);
  // she is turned only while she is deep
  assert.ok(herAt(TURN - 0.01).pitch === 0 && herAt(TURN).pitch === HEAD.pitch);
  // her root never jumps (she dives fastest, 16 cm a second, when she is already in the murk)
  for (let t = 8; t < LENGTH; t += 0.05) {
    const a = herAt(t), b = herAt(t + 0.05);
    if (t < TURN && t + 0.05 >= TURN) continue;
    assert.ok(Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) < 0.6, `her place at ${t.toFixed(2)}`);
    assert.ok(Math.abs(b.sink - a.sink) < 0.85, `her sink at ${t.toFixed(2)}`);
  }
  // the sail is up through the middle of part 3
  assert.ok(SAIL.up >= 20 && SAIL.down <= 30 && SAIL.down - SAIL.up >= 3);
  assert.ok(herAt(SAIL.up).at[0] < -3 && herAt(SAIL.down).at[0] > 0, 'it glides across the middle, left to right');
});

test('the big fish: up from the deep, out of the water in part 5, about 5 cm at the top, taken just past it', () => {
  assert.equal(jumperAt(JUMP.rise - 0.1), null);
  assert.equal(jumperAt(JUMP.take), null, 'hers from the moment her jaws shut');
  assert.ok(jumperAt(JUMP.rise).at[1] <= -12, 'first seen far down');
  assert.ok(JUMP.out >= 42 && JUMP.take <= 50);
  assert.ok(Math.abs(jumperAt(JUMP.out).at[1]) < 1e-9 && jumperAt(JUMP.out).air);
  const top = jumperAt(JUMP.topAt);
  assert.ok(Math.abs(top.at[1] - JUMP.top) < 1e-6 && Math.abs(top.pitch) < 0.5, 'level at the top');
  assert.ok(JUMP.top + 0.6 > 4.5 && JUMP.top + 0.6 < 5.6, 'its back about 5 cm up');
  assert.ok(JUMP.take > JUMP.topAt && JUMP.take - JUMP.topAt < 0.3);
  // in the air it goes as a thrown thing does
  const a = jumperAt(JUMP.out + 0.2), b = jumperAt(JUMP.out + 0.4), c = jumperAt(JUMP.out + 0.6);
  assert.ok(Math.abs((c.at[1] - 2 * b.at[1] + a.at[1]) / 0.04 + GRAVITY) < 1e-6);
  // she reaches for it and her jaws are open as it comes, shut on it when it is hers
  // (shut as far as the fish across her jaws lets them)
  assert.ok(herAt(JUMP.take - 0.1).jaw > 8 && herAt(JUMP.take).strike === 1 && herAt(JUMP.take + 0.05).jaw < herAt(JUMP.take - 0.1).jaw - 2);
  assert.ok(JUMP.gulp > JUMP.take && herAt(JUMP.gulp + 0.3).jaw === 0);
  // the tip of her snout is on the fish's flank the moment her jaws shut: under its middle, on her side of it, less than half a cm off
  const fish = jumperAt(JUMP.take - 1e-6).at, tip = herAt(JUMP.take).snout;
  assert.ok(Math.hypot(tip[0] - fish[0], tip[1] - fish[1], tip[2] - fish[2]) < 0.5 && tip[1] < fish[1] && tip[2] < fish[2]);
  // and her head is hers again (her look's) well before the butterfly comes
  assert.ok(herAt(JUMP.gulp + 2).strike === 0 && herAt(JUMP.gulp + 2).look === 'eye' && herAt(JUMP.gulp + 2).snout === null);
  // the tip of her snout takes her head over while her look still holds it (with neither, her head would lift over 6,5 cm)
  assert.ok(herAt(HOLD.to + 0.25).look === 'eye' && herAt(HOLD.to + 0.25).strike > 0.3 && herAt(HOLD.to + 0.25).snout);
  for (let t = HOLD.to; t <= JUMP.gulp + 2; t += 0.05) {
    const h = herAt(t);
    assert.ok(h.jaw >= 0 && h.jaw <= 9, `her jaw opens 9 degrees at most (${t.toFixed(2)})`);
    assert.ok(h.strike === 1 || h.look === 'eye', `her head is led at ${t.toFixed(2)}`);
  }
  // she holds the fish a moment before it goes down
  assert.ok(JUMP.gulp - JUMP.take >= 1.5 && herAt((JUMP.take + JUMP.gulp) / 2).jaw > 4, 'her jaws stay open by the fish across them');
});

test('she never stands higher out of the water than in the hold (the smallest page has no more room over her head)', () => {
  for (let t = 0; t <= LENGTH; t += 0.05) assert.ok(herAt(t).sink >= HEAD.sink - 1e-9, `at ${t.toFixed(2)}`);
});

test('the small fish: in their rounds while the pond is calm, out of her way in part 2, home again at the end', () => {
  FISH.forEach((f, i) => {
    assert.equal(fishAt(i, 3).away, 0);
    assert.ok(f.flee >= 8 && f.flee < 20, `fish ${i} gets out of her way in part 2`);
    assert.ok(Math.abs(fishAt(i, 25).away - 1) < 1e-9);
    assert.ok(fishAt(i, LENGTH - 0.01).away < 0.02, `fish ${i} is home at the end`);
    assert.ok(Math.hypot(fishAt(i, 3).seen[0] - f.calm[0], fishAt(i, 3).seen[1] - f.calm[1]) <= f.round + 1e-9);
    for (let t = 0; t < LENGTH; t += 0.1) {
      const a = fishAt(i, t).seen, b = fishAt(i, t + 0.1).seen;
      assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) < 2.2, `fish ${i} does not jump at ${t.toFixed(1)}`);
    }
  });
});

test('the butterfly: on its lily, over to her snout in part 6, two to three seconds there, off before she sinks, home before the end', () => {
  const { up, land, off, home } = BUTTERFLY_TIMES;
  assert.ok(up >= 50 && home <= 60);
  assert.equal(butterflyAt(10).on, 'lily');
  assert.equal(butterflyAt((up + land) / 2).on, 'over');
  assert.equal(butterflyAt((land + off) / 2).on, 'snout');
  assert.equal(butterflyAt((off + home) / 2).on, 'back');
  assert.equal(butterflyAt(LENGTH - 1).on, 'lily');
  assert.ok(off - land >= 2 && off - land <= 3.5, `${off - land} s on her snout`);
  // she holds still while it sits, and has sunk next to nothing when it lifts off
  assert.equal(herAt(land).sink, herAt(off - 0.5).sink);
  assert.ok(herAt(off).sink - herAt(land).sink < 0.4, 'it leaves before the water comes near');
  assert.ok(herAt(home).sink > herAt(off).sink + 5, 'then she goes down');
  // her look keeps all its weight from the moment she turns to it until she is gone (with less, her snout would rise into it)
  for (let t = up + 1; t < GONE; t += 0.1) assert.deepEqual([herAt(t).look, herAt(t).lookWeight], ['butterfly', 1], `her look at ${t.toFixed(1)}`);
});

test('the last second is the calm pond: she is gone, nothing leaps or flies, no splash is in the air, the water has settled', () => {
  for (let t = LENGTH - 1; t <= LENGTH; t += 0.25) {
    assert.equal(herAt(t).there, false);
    assert.equal(jumperAt(t), null);
    assert.equal(butterflyAt(t).on, 'lily');
  }
  assert.ok(GONE <= CALM.from);
  for (const [t, , , , up] of SPLASHES) assert.ok(t + (2 * up[1]) / GRAVITY < LENGTH - 1, 'every drop has fallen');
  assert.ok(RUNOFF.to < 42);
  for (const [t] of BUBBLES) assert.ok(t + BUBBLE.seconds + BUBBLE.each * BUBBLE.apart < CALM.from + 1, 'the last bubbles are up');
  assert.ok(RINGS.filter(r => r[0] >= LENGTH - 1 && r[3] > 0.4).length === 0, 'only the pond\'s own faint rings');
});

test('what the animals do shows on the water: rings in order, where the page is, drops counted', () => {
  RINGS.slice(1).forEach((r, i) => assert.ok(r[0] >= RINGS[i][0], 'in order'));
  for (const [t, x, z, strength] of RINGS) {
    assert.ok(t >= 0 && t < LENGTH && strength > 0 && strength <= 1.5);
    assert.ok(Math.abs(x) < 10.4 && Math.abs(z) < 6.6, `a ring on the page: ${x.toFixed(1)}, ${z.toFixed(1)} at ${t}`);
  }
  // the sail's rings, her head's, the fish's, hers as she comes down and goes under
  for (const [from, to, least] of [[21.5, 30.5, 6], [34.3, 37, 3], [JUMP.out, JUMP.out + 0.5, 2], [44.3, 45, 3], [57, 59.5, 3]]) {
    assert.ok(RINGS.filter(r => r[0] >= from && r[0] <= to).length >= least, `rings between ${from} and ${to}`);
  }
  assert.ok(BUBBLES.filter(b => b[0] >= 8 && b[0] < 20).length >= 5, 'bubbles rise ahead of her in part 2');
  for (const [t, , , depth] of BUBBLES) assert.ok(depth > 0 && depth <= 11 && t >= 8);
  assert.equal(DROPS, SPLASHES.reduce((n, s) => n + s[3], 0) + RUNOFF.drops);
  assert.ok(RUNOFF.from >= 34 && RUNOFF.from < HOLD.from, 'water runs off her as her head comes up');
});
