// Chapter 2's fishing (remake/chapters/kafli2.js, scene 4; docs/superpowers/specs/2026-10-31-kafli-2-bod-til-uggedlu-design.md, section 4):
// Uggeðla is hungry and the fish are quick. They jump out of the channel in front of her one at a time, in an arc of 1.5 s; a big one
// (a metre and a half long, glittering) is the child's to tap, a small one (60 cm, not glittering) is to be left alone. A tapped big fish hangs in the air
// for a moment, her head darts to it, her jaws snap shut on it and she swallows it (kafli2-uggedla.js: catchFish), and Mosi counts it in
// the masculine, fiskur being masculine: Einn, tveir, þrír, fjórir, fimm. A tapped small fish is told it is too small by her and
// swims off with a splash. A child who taps no big fish for 8 s is given a hint (Mosi), and at 16 s she catches the next big fish herself,
// and Mosi counts it. With the fifth fish counted the task ends (the scene says her thanks).
//   fishing(s, c)         the whole task, a generator for the scheduler; it returns { caught: [{ at, how: 'tapped' | 'helped', doneAt }],
//                         smallTaps }: when each fish was caught (the moment her jaws shut), how, and when she was back as she was
//   getUp(s, c)           she is ready to fish: the sail risen and her head up and turned to the bank (nothing, if she is already: scene 3
//                         has done it by the time the fishing begins; a test that plays the fishing alone brings her up with it)
//   jumpOrder(count)      the jumps, one after the other: [{ kind: 'big' | 'small', spot }], the same every time
//   jumpPath(spot, kind, way)   the arc of one jump: { at(u, out) } the fish's middle at u (0 to 1) of the way, over the spot FISHING_SPOTS[spot]
// `c` is the chapter's shared state (kafli2.js): c.say(speaker, id) says a line (one voice at a time), c.uggedla the actor. While it runs
// c.fish is the fish in the air, { point, size, kind, spot, phase, launched, caught() }: phase 'air' (leaping, a tap target), 'held' (tapped, or
// hers, hanging in the air while she comes), 'caught', 'shooed' (a small one that was tapped, on its way) or 'gone'; it is null between jumps.
//
// How it runs. The task is one fish after another: a short gap (and, after a tap on a small fish, her line), the jump (a tap target named
// 'fish' that moves with the fish: radius TAP_RADIUS, bigger than the fish itself, for a finger on a tablet held upright, where a metre is
// 17 to 24 px), then the end of it: caught, swum off, or gone back into the water. A tap is read once for each fish, by the frame loop, so
// two in one frame, a second during the catch and one on a fish that is gone count nothing more. Her own catch (HELP_AFTER) takes the next
// big fish in the air, or a big fish is the next to jump if a small one was to: the child's waiting is made of big catches only.
import * as THREE from 'three';
import { seededRandom } from '../engine/random.js';
import { ringsFor } from '../engine/neck-ride.js';
import { createModel } from '../world/critters/models.js';
import { sparkleTrail } from '../world/props/sparkles.js';
import { waterShape } from '../world/props/water.js';
import { SIKI_LAYOUT, FISHING_SPOTS, FISH_ARC } from './kafli2-siki.js';
import { riseSail, headUpWithFish, catchFish, SINK } from './kafli2-uggedla.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const smooth = t => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// The numbers

/**
 * The length of a fish in metres, nose to tail: a big one the Fen's fish (30 cm) stretched five times, a small one twice. They were a metre and
 * 30 cm; on the screen a six-year-old could not tell big from small (the small one was a speck, only its ring showed), so now a metre and a half
 * and 60 cm: on a 1280x800 screen a small one is 27 to 40 px long and a big one 2.5 times that.
 */
export const FISH_SIZES = { big: 1.5, small: 0.6 };
export const JUMP_SECONDS = 1.5; // in the air, from the water to the water
export const HINT_AFTER = 8; // seconds without a big catch before Mosi's hint
export const HELP_AFTER = 16; // and before she catches the next big fish herself
export const FISH_COUNT = 5; // big fish to catch
/** How far a tap may be from a fish's middle, in metres: the finger's, not the fish's (a big one is a metre and a half long). */
export const TAP_RADIUS = { big: 2.2, small: 1.3 };
const APEX = { big: 1.8, small: 1.0 }; // m over the water at the top of a jump
const ARC = { big: 2.0, small: 1.2 }; // m along FISH_ARC from the water to the water
const FIRST_AFTER = 1.2; // s before the first jump
const GAP = [0.9, 1.7]; // s between one fish gone and the next jump
const SWIM_OFF = 0.7; // s a small fish swims on at the water's top before it is gone
const COUNT_LINES = ['k2_mosi_einn', 'k2_mosi_tveir', 'k2_mosi_thrir', 'k2_mosi_fjorir', 'k2_mosi_5'];
const LEVEL = waterShape(SIKI_LAYOUT.water).level;
const LIFTED = 1.6; // m over the water: a tapped fish hangs at this height at least, where her snout reaches
const FLEX_BEATS = 5; // a fish's tail beats a second in the air
const SMALL_LIGHT = '#a8d4e6', SMALL_GLOW = 0.55; // a small fish's silver

// ---------------------------------------------------------------------------------------------
// The jumps

/**
 * The jumps, one after the other: about one in three small and never two in a row (the next small is two, three or four jumps after
 * the last), the first big (a first success), and each over another spot than the last. The same every time (the chapter's own seed).
 */
export function jumpOrder(count, seed = 'kafli2 fishing') {
  const random = seededRandom(seed);
  const order = [];
  let small = 2 + Math.floor(random() * 2); // the third or the fourth fish is the first small one
  let spot = Math.floor(random() * FISHING_SPOTS.length);
  for (let i = 0; i < count; i++) {
    if (i) spot = (spot + 1 + Math.floor(random() * (FISHING_SPOTS.length - 1))) % FISHING_SPOTS.length;
    const kind = i === small ? 'small' : 'big';
    if (kind === 'small') small = i + [2, 3, 3, 4][Math.floor(random() * 4)];
    order.push({ kind, spot });
  }
  return order;
}

/**
 * One jump's arc: the fish's middle from the water on one side of the spot to the water on the other along FISH_ARC (`way` 1 or -1),
 * over JUMP_SECONDS, a parabola APEX high. at(u, out) puts the middle at u (0 to 1) of the way into `out` and returns it; `velocity`
 * is the way it is going then (not unit), for the fish to point its nose along.
 */
export function jumpPath(spot, kind, way = 1) {
  const [cx, cz] = FISHING_SPOTS[spot];
  const half = (ARC[kind] / 2) * way;
  return {
    at(u, out = new V3()) {
      const k = clamp(u, 0, 1);
      return out.set(cx + FISH_ARC[0] * half * (2 * k - 1), LEVEL + APEX[kind] * 4 * k * (1 - k), cz + FISH_ARC[1] * half * (2 * k - 1));
    },
    velocity(u, out = new V3()) {
      const k = clamp(u, 0, 1);
      return out.set(FISH_ARC[0] * half * 2, APEX[kind] * 4 * (1 - 2 * k), FISH_ARC[1] * half * 2);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The fish we see: the Fen's fish (world/critters/models.js), 0.3 m long, drawn at the size of the one that jumps

function makeView(world) {
  const model = createModel('fish');
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }); // as the fish she holds (one shader)
  material.name = 'fishing fish';
  const mesh = new THREE.Mesh(model.geometry, material);
  mesh.name = 'fish';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'Fishing fish';
  group.visible = false;
  group.add(mesh);
  world.scene.add(group);
  const flex = mesh.morphTargetDictionary?.flex;
  const velocity = new V3();
  const view = {
    group,
    /** The fish of a kind, shown at `point`, nose along `heading` (a vector, or null: level, as it was). */
    show(kind, point, heading, { shine = 0, beat = 0 } = {}) {
      group.visible = true;
      group.scale.setScalar(FISH_SIZES[kind] / 0.3);
      group.position.set(point.x, point.y - 0.044 * group.scale.x, point.z);
      if (heading) {
        velocity.copy(heading);
        group.rotation.set(0, -Math.atan2(velocity.z, velocity.x), Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)), 'YXZ');
      }
      if (flex !== undefined) mesh.morphTargetInfluences[flex] = 0.5 + 0.5 * Math.sin(TAU * beat);
      // a big one shines gold, glittering; a small one has a cool silver light on it (it does not glitter): on the Fen's gold reed a
      // plain small fish is gold on gold and cannot be seen
      material.emissive.set(kind === 'small' ? SMALL_LIGHT : '#ffbf4a');
      material.emissiveIntensity = kind === 'small' ? SMALL_GLOW : shine;
    },
    hide() { group.visible = false; },
    dispose() {
      group.removeFromParent();
      model.geometry.dispose();
      material.dispose();
    },
  };
  return view;
}

// ---------------------------------------------------------------------------------------------
// She gets up

/**
 * She is ready to fish: her sail risen out of the reed and her head up, turned to the bank where Mosi stands (what riseSail and
 * headUpWithFish leave her as). A scene that has her up already (the one where she shows herself) leaves nothing for it to do.
 */
export function* getUp(s, c) {
  const rig = c.uggedlaRig;
  if (!rig) return;
  if (rig.v.sink > SINK.sail + 0.5) yield* riseSail(s, c, { seconds: 3 });
  if (rig.v.tuck < 0.99) yield* headUpWithFish(s, c);
}

// ---------------------------------------------------------------------------------------------
// The fishing

export function* fishing(s, c) {
  const { world } = c;
  const order = jumpOrder(60);
  const random = seededRandom('kafli2 fishing gaps');
  const view = makeView(world);
  const ring = (x, z, strength) => { c.ring ??= ringsFor(world, { most: 3 }); return c.ring([x, 0, z], strength); };
  // what the child's waiting is made of: the last big catch, whether the hint has been said for it, her line about a small fish
  const state = { caught: [], smallTaps: 0, since: s.time, hinted: false, herLine: null, count: null, fish: null };
  const unhear = s.onTap('fish', tap => {
    const fish = state.fish;
    if (fish?.phase === 'air') fish.tap ??= tap; // the first tap on a fish in the air; any other (second, in the same frame, on one that is gone) counts nothing
  });
  const hint = s.after(0, () => hinting(s, c, state));
  c.fish = null;
  try {
    let index = 0;
    yield s.wait(FIRST_AFTER);
    while (state.caught.length < FISH_COUNT) {
      const plan = order[index % order.length];
      const wayRandom = random();
      index++;
      // her own catch is due: the next to jump is a big one
      const kind = plan.kind === 'small' && s.time - state.since >= HELP_AFTER ? 'big' : plan.kind;
      yield* jump(s, c, state, view, ring, { kind, spot: plan.spot, way: wayRandom < 0.5 ? 1 : -1, seed: index });
      if (state.caught.length >= FISH_COUNT) break;
      yield s.until(() => !state.herLine || state.herLine.done); // she has said her piece about a small one
      yield s.wait(GAP[0] + (GAP[1] - GAP[0]) * random());
    }
    // the last count, said before the scene thanks him
    if (state.count) yield state.count;
  } finally {
    hint.cancel();
    unhear();
    s.target('fish', null);
    view.dispose();
    c.fish = null;
  }
  return { caught: state.caught, smallTaps: state.smallTaps };
}

/** Mosi's hint: 8 s after the last big catch, once, when nobody is speaking. */
function* hinting(s, c, state) {
  for (;;) {
    yield s.until(() => !state.hinted && s.time - state.since >= HINT_AFTER);
    state.hinted = true;
    yield s.until(() => !c.saying);
    yield* c.say('mosi', 'k2_mosi_hint_fish');
  }
}

/** One fish: it leaps, and ends caught, swum off, or back in the water. */
function* jump(s, c, state, view, ring, { kind, spot, way, seed }) {
  const { world } = c;
  const path = jumpPath(spot, kind, way);
  const fish = { point: new V3(), size: FISH_SIZES[kind], kind, spot, phase: 'air', launched: s.time, tap: null, helped: false, caught: null };
  const heading = new V3();
  path.at(0, fish.point);
  state.fish = c.fish = fish;
  if (kind === 'big') {
    sparkleTrail(world, () => fish.point, { duration: JUMP_SECONDS + 0.4, count: 40, life: 0.9, colour: '#fff0b0', size: 0.9, seed: `fishing glitter ${seed}` });
  }
  s.target('fish', { point: fish.point, radius: TAP_RADIUS[kind] });
  s.sfx('fish', { part: 'out' });
  ring(fish.point.x, fish.point.z, 0.5);
  const shine = kind === 'big' ? 0.9 : 0;
  // in the air
  let u = 0;
  while (fish.phase === 'air') {
    u = (s.time - fish.launched) / JUMP_SECONDS;
    if (fish.tap) {
      if (kind === 'big') break;
      fish.phase = 'shooed';
      break;
    }
    if (kind === 'big' && u >= 0.3 && s.time - state.since >= HELP_AFTER) { fish.helped = true; break; } // her own catch
    if (u >= 1) break;
    path.at(u, fish.point);
    path.velocity(u, heading);
    view.show(kind, fish.point, heading, { shine: shine * (0.8 + 0.2 * Math.sin(TAU * 3 * u)), beat: FLEX_BEATS * u * JUMP_SECONDS });
    yield;
  }
  if (fish.phase === 'air' && (fish.tap || fish.helped)) {
    yield* take(s, c, state, view, ring, fish, shine, heading);
  } else if (fish.phase === 'shooed') {
    yield* letGo(s, c, state, view, ring, fish, path, u);
  } else {
    // gone back into the water, not caught: a splash
    path.at(1, fish.point);
    splash(s, ring, fish.point);
    view.hide();
  }
  s.target('fish', null);
  fish.phase = fish.phase === 'caught' ? 'caught' : 'gone';
  state.fish = c.fish = null;
}

function splash(s, ring, point) {
  s.sfx('fish', { part: 'in' });
  ring(point.x, point.z, 0.7);
  s.after(0.25, () => { ring(point.x + 0.3, point.z, 0.4); });
}

/**
 * A big fish is taken, by a tap or by her (help): it hangs where it is, wriggling, as her head comes to it, and when her jaws shut on it
 * (catchFish's caught()) it is hers, counted. Resolves when she is back as she was.
 */
function* take(s, c, state, view, ring, fish, shine, heading) {
  fish.phase = 'held';
  s.target('fish', null);
  const how = fish.tap ? 'tapped' : 'helped';
  const entry = { at: null, how, doneAt: null };
  const hold = fish.point.clone();
  const level = heading.clone().setY(0); // level, the way it was going
  fish.caught = () => {
    fish.phase = 'caught';
    view.hide();
    entry.at = s.time;
    state.caught.push(entry);
    state.since = s.time; // the child's waiting begins again from the catch
    state.hinted = false;
    const n = state.caught.length;
    ring(hold.x, hold.z, 0.6);
    s.sfx('countTone', { index: n });
    state.count = s.after(0, () => c.say('mosi', COUNT_LINES[n - 1]));
  };
  const catching = s.after(0, () => catchFish(s, c, fish));
  const heldAt = s.time;
  const up = Math.max(hold.y, LEVEL + LIFTED) - hold.y; // a fish tapped low (as it leaves the water) is lifted a little, to where her neck reaches it
  while (!catching.done) {
    const t = s.time - heldAt;
    if (fish.phase === 'held') {
      fish.point.set(hold.x, hold.y + up * smooth(t / 0.3) + 0.04 * Math.sin(TAU * 1.6 * t), hold.z);
      view.show(fish.kind, fish.point, level, { shine, beat: 4 * t });
    }
    yield;
  }
  if (fish.phase !== 'caught') fish.caught(); // (never: the jaws shut on every fish she is sent for)
  entry.doneAt = s.time;
}

/**
 * A small fish that was tapped: it flicks over and falls back into the water with a small splash, and swims off a little way
 * along the water, ringing it, before it is gone. She says it is too small.
 */
function* letGo(s, c, state, view, ring, fish, path, from) {
  state.smallTaps++;
  s.target('fish', null);
  state.herLine = s.after(0, () => c.say('uggedla', 'k2_uggedla_small'));
  const heading = new V3();
  const began = s.time;
  const left = Math.max(0.25, (1 - from) * JUMP_SECONDS * 0.7); // it falls faster than it rose
  const start = fish.point.clone();
  const end = path.at(1, new V3());
  while (s.time - began < left) {
    const k = (s.time - began) / left;
    fish.point.lerpVectors(start, end, k);
    fish.point.y = LEVEL + (start.y - LEVEL) * (1 - k * k);
    heading.subVectors(end, start).setY(-1.2);
    view.show('small', fish.point, heading, { beat: 7 * (s.time - began) });
    yield;
  }
  fish.point.copy(end);
  splash(s, ring, fish.point);
  // swimming off along the top of the water, away from where it fell
  const away = new V3(FISH_ARC[0], 0, FISH_ARC[1]).multiplyScalar(Math.sign(end.x - start.x || 1) * 1.4);
  const from2 = fish.point.clone().setY(LEVEL - 0.03);
  const swum = s.time;
  heading.copy(away);
  s.after(SWIM_OFF * 0.5, () => { ring(from2.x + away.x * 0.5, from2.z + away.z * 0.5, 0.3); });
  while (s.time - swum < SWIM_OFF) {
    const k = smooth((s.time - swum) / SWIM_OFF);
    fish.point.copy(from2).addScaledVector(away, k);
    fish.point.y = LEVEL - 0.03 - 0.25 * k * k;
    view.show('small', fish.point, heading, { beat: 8 * (s.time - swum) });
    yield;
  }
  view.hide();
}
