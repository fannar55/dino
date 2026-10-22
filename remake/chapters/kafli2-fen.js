// Chapter 2's Fen staging (remake/chapters/kafli2.js, scenes 3 to 5): the Fen's own animals, the berry bushes and Egill's basket,
// what scene 4 does with them, and the data they stand on:
//   fenAnimals(s, c)        the dragonfly, the turtle, the fish and the early bird, a tap on one makes it react and puts it in the book
//   berryBushes(world)      the bushes on the berry hummocks (BERRY_BUSHES)
//   pickBerries(s, c)       the search for the five red bunches, each flying into the basket and counted; the blue ones the birds'
//   holdUpBasket(s, c)      the child drags the basket up over Egill (or taps him; after 6 s he holds it up himself)
//   eatFromBasket(s, c)     she eats the berries out of it, chewing
// `c` is the chapter's shared state; `c.say(speaker, id)` says a line one voice at a time (kafli2.js).
import { createCritters } from '../world/critters/critters.js';
import { createBerryBushes } from '../world/props/berries.js';
import { tapOrWait } from '../engine/scene/tap-or-wait.js';
import { mouthOf } from './kafli2-thorsedla.js';

// The marsh berry bushes (world/props/berries.js), on the berry hummocks east of Egill's, clear of the Fen's plants and its water:
// the big red one and the one nearer the water on the south hummock, a red one on the north hummock among the reed, and the
// blue one (the birds') between them, where the child sees it first. `facing` is the side their berries hang on: toward where the
// child looks from, behind Egill on the bank (EGILL_PICKS).
export const BERRY_BUSHES = [
  { position: [16.5, -10.2], kind: 'red', count: 2, facing: 175 },
  { position: [18.3, -12.3], kind: 'red', count: 2, facing: 165 },
  { position: [16.4, -5.4], kind: 'red', count: 1, facing: 200 },
  { position: [15.0, -7.8], kind: 'blue', count: 3, facing: 185 },
];

// The child drags the basket up to over Egill's head, or taps him (scene 4).
const OVER_EGILL = { actor: 'egill', part: 'head', offset: [0.15, 0.45, 0], local: true };
// The berry search: the free look's limits round the view behind Egill (fen_pick), and Mosi's three hints, one after another.
const PICK_LOOK = { yaw: [-45, 45], pitch: [-12, 16] };
const BERRY_HINTS = ['k2_mosi_hint_berry1', 'k2_mosi_hint_berry2', 'k2_mosi_hint_berry3'];

// The Fen's own animals (critters.js), where the child sees them: the early bird in the reed on the west shore of p4, where the
// camera's rise over the Fen starts, and flies up as it pans; and by the berry hummocks a dragonfly hanging in the air, a turtle on
// the bank of the channel, and a fish in the channel. `up` is metres above the ground, or the water (`water`).
export const FEN_CRITTERS = [
  { name: 'fen-bird', kind: 'earlyBird', at: [5.4, 8.0], up: 0, heading: 150 },
  { name: 'fen-dragonfly', kind: 'dragonfly', at: [14.4, -11.4], up: 0.9, heading: 200 },
  { name: 'fen-turtle', kind: 'turtle', at: [17.7, -13.5], up: 0, heading: -150 },
  { name: 'fen-fish', kind: 'fish', at: [16.5, -15.4], up: 0, water: true, heading: 10 },
];

/**
 * The Fen's own animals where FEN_CRITTERS puts them, on the ground or the water, each a tap target: a tap makes it react, with its
 * sound, and puts it in the book. They ring the water through `c.ring` (at most three of the script's rings at once). Returns
 * { critters, spots, quiet() }: quiet() takes them off the pointer (as Egill goes up her neck, where a tap is for the far friends).
 */
export function fenAnimals(s, c) {
  const { world } = c;
  const ground = (x, z) => world.heightAt(x, z);
  const spots = FEN_CRITTERS.map(({ name, kind, at: [x, z], up, water, heading }) => ({
    name, kind, heading, position: [x, (water ? world.forest?.water?.level ?? ground(x, z) : ground(x, z)) + up, z],
  }));
  const critters = createCritters(world, { spots, ripple: (point, strength) => c.ring(point, strength) });
  const unhear = critters.targets.map(t => {
    const { kind } = FEN_CRITTERS.find(f => f.name === t.name);
    s.target(t.name, t);
    return s.onTap(t.name, tap => {
      critters.react(t.name);
      s.sfx(kind);
      s.found(kind, tap);
    });
  });
  // they can be tapped on the ground until Egill goes up her neck (scene 6), where a tap is for the far friends, not for them
  const quiet = () => {
    for (const t of critters.targets) s.target(t.name, null);
    for (const stop of unhear.splice(0)) stop();
  };
  return { critters, spots: FEN_CRITTERS, quiet };
}

/** The berry bushes on the berry hummocks, on the ground as it is there. */
export function berryBushes(world) {
  return createBerryBushes(world, { bushes: BERRY_BUSHES.map(b => ({ ...b, position: [b.position[0], world.heightAt(...b.position), b.position[1]] })) });
}

/**
 * The search (scene 4): the child looks round the hummocks and taps the red bunches; each flies into the basket and Mosi counts
 * it. A blue one: "those are the birds'". Hints at 12, 24 and 36 s; at 48 s Egill picks it himself, and the next sooner.
 */
export function* pickBerries(s, c) {
  const { egill } = c;
  c.berries.glimmer(true);
  const blue = c.berries.targets.filter(t => t.kind === 'blue');
  for (const t of blue) s.target(t.name, t);
  let telling = null;
  const unhear = blue.map(t => s.onTap(t.name, () => {
    c.berries.shake(bushOf(t.name));
    if (!telling || telling.done) telling = s.after(0, function* birds() { yield s.until(() => !c.saying); yield* c.say('mosi', 'k2_mosi_blue'); });
  }));
  let counting = null;
  const red = c.berries.targets.filter(t => t.kind === 'red');
  yield s.search({
    explore: PICK_LOOK,
    targets: red.map(t => ({ name: t.name, point: t.point, radius: t.radius, hint: BERRY_HINTS })),
    quick: { hintAfter: 6, helpAfter: 1 },
    onFound: (name, index, how) => {
      const by = how === 'tapped' ? 'child' : 'egill';
      c.picks.push({ name, by, kind: 'red', at: s.time });
      if (by === 'egill') s.after(0, () => egill.lookAt(c.berries.berry(name).point, { weight: 0.8, maxPitch: 40 }));
      c.berries.shake(bushOf(name));
      const flight = c.berries.pick(name, c.basket.point);
      const before = counting;
      counting = s.after(0, function* count() {
        yield flight;
        yield c.basket.add('red');
        if (before) yield before;
        yield s.until(() => !c.saying);
        yield* c.say('mosi', `k2_mosi_${index + 1}`, { hold: 0.3 });
      });
      return flight;
    },
  });
  if (counting) yield counting;
  c.berries.glimmer(false);
  for (const t of blue) s.target(t.name, null);
  for (const stop of unhear) stop();
  if (telling && !telling.done) yield telling;
}

/** The child drags the basket up over Egill, or taps him; after 6 s he holds it up himself. Resolves 'drag', 'tap' or 'idle'. */
export function* holdUpBasket(s, c) {
  s.tray.show([{ id: 'basket', icon: 'basket' }]);
  const how = yield* tapOrWait(s, 'egill', s.drag('basket', OVER_EGILL, { radius: 170, idle: 6 }));
  s.tray.hide();
  return how === 'egill' ? 'tap' : how === 'dropped' ? 'drag' : 'idle';
}

/** She eats the berries out of the basket, chewing: "Mmm… rauðber!" */
export function* eatFromBasket(s, c) {
  const her = c.thorsedla.raw;
  her.talk({ text: 'namm namm namm', duration: 1.6 });
  yield c.basket.empty(out => out.copy(mouthOf(her)));
  yield* c.say('thorsedla', 'k2_thorsedla_mmm');
}

/** The bush a berry hangs on, from its name (berry_<bush>_<i>). */
const bushOf = name => Number(name.split('_')[1]);
