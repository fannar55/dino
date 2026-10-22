// Chapter 2's lookout (remake/chapters/kafli2.js, scene 6): up on Þórseðla's head Egill finds the three friends far away, each
// glittering where she is, and each goes onto the book's map (the fifth task of the plan). The pieces the scene calls, with their
// constants and helpers:
//   farFriends(s, c, spots)  the three of them (world/props/far-friends.js), made behind the start button so that their models and
//                            light levels are ready long before the Fen; shown from the Fen on, and only from above 6 m
//   haze(c, factor, seconds) the air thickens round the lookout (the fog's density, eased): the Fen far below reads far below
//   lookDown(s, c)           at the top, the camera looks down past Egill at Mosi: "Vá… Mosi er pínulítill!", and Mosi's answer
//   findFriends(s, c)        "Horfðu vel, Egill…", the camera turns out over the Fen to the north-west and the child looks round for
//                            Slóeðla and Flugeðla; then it turns round to the east-south-east and the child finds Uggeðla in the reed.
//                            A hint for each (a pan there and Mosi's line) at 12, 24 and 36 s, and at 48 s she is found for the child;
//                            each found glitters, does what she does (far-friends.js: react), flies onto the map and Mosi names her
// `c` is the chapter's shared state; the finds are kept in c.farFinds ({ name, how, at }) for captures and probes.
import * as THREE from 'three';
import { createFarFriends } from '../world/props/far-friends.js';
import { LOOKOUT_CAMERA, LOOKOUT_HEAD, MOSI_HEAD, downToMosi } from './kafli2-thorsedla.js';

// The friends, in the order the script hints them (Slóeðla, Flugeðla, Uggeðla: k2_mosi_hint_far1..3): where each stands in the
// Fen (the layout's farFriends), which way she faces (a three-quarter view from the lookout, so the crest, the wings and the sail
// read), and what she does while she waits. Uggeðla lies low in a reed bed of her own (far-friends.js: reed), thickest on the
// lookout's side: the Fen's own reed is culled 64 m from the camera, and the authored reed round her would not show from her head.
const FRIENDS = {
  sloedla: { heading: 64, clip: 'wade', y: 0 }, // wading in the far pool (p5): a few slow steps now and then
  flugedla: { heading: 55, clip: 'idle', y: 0, perch: 'snag' }, // on top of the white snag, facing the lookout
  uggedla: { heading: -64, clip: 'idle', y: 0, sink: 1.6, reed: { clumps: 11, radius: [1.6, 4.2], height: [2.3, 3.4] } }, // lying low in the reed, her back and sail up out of it
};
const FIRST = ['sloedla', 'flugedla']; // to the north-west, seen together
const LAST = 'uggedla'; // to the east-south-east, past her conifers
const HINTS = { sloedla: 'k2_mosi_hint_far1', flugedla: 'k2_mosi_hint_far2', uggedla: 'k2_mosi_hint_far3' };
const FOUND = { sloedla: 'k2_mosi_found_sloedla', flugedla: 'k2_mosi_found_flugedla', uggedla: 'k2_mosi_found_uggedla' };

// The camera of the search: behind Egill on his right, 2 m above his feet, over her neck and back curving away below. First it
// turns out over the Fen to the north-west, between Slóeðla and Flugeðla, a little to the left of their middle and 14 degrees down,
// so both glitter in the upper half of the frame, the Fen lies far below, and her tail curves away through the bottom left: he is
// nine metres up, on her. The lens is a little long (42 degrees), so they read from 80 to 100 m. The free look turns as far as each
// of them and 12 degrees more, 30 down and 10 up. Then the camera turns round (TURN_SPEED) to Uggeðla in the east-south-east, past
// her conifers, and the free look turns 70 degrees either way from her (s.search's explore, as the brief has it). From here the line
// to Uggeðla passes 4.8 m clear of the south-east conifer's crown, which hides her from his head (the layout's sight line from it
// passes 1.3 m from its axis at 9.3 m): the search is seen from here, not from his eyes.
const SEARCH_CAMERA = { offset: [-3.2, 2.0, 2.4], local: true, stiffness: 1.6, fov: 44, maxSpeed: 2.4 };
const SEARCH_PITCH = [-30, 10]; // degrees the free look tilts down and up
const SEARCH_MARGIN = 12; // degrees the free look turns past the friend furthest round on each side
const SEARCH_DOWN = 8; // degrees under the level the view looks as it turns out over the Fen
const SEARCH_LEAN = -6; // degrees the view turns out to the left of the first two friends' middle, toward her tail
const LAST_LOOK = { yaw: [-70, 70], pitch: [-30, 10] }; // the free look round Uggeðla
const LAST_DOWN = 6; // degrees the view of her looks under her: she sits a little above the middle, the reed and the channel below
const TURN_SPEED = 16; // degrees a second, on average, the camera turns from the first two friends round to Uggeðla (eased)
// Hints at 12, 24 and 36 s and a find at 48 s (STYLE.md 10) for the first friend; once one was found for the child the next
// ones come sooner (hints every 6 s, found at 24 s), so a child who taps nothing is through the lookout in about two minutes.
const PACE = { hintAfter: 12, helpAfter: 3 };
const QUICK = { hintAfter: 6, helpAfter: 3 };
const SETTLE = 1.6; // seconds the camera turning out over the Fen has to come to rest before the free look starts from it
const HAZE = { up: 1.6, rise: 4 }; // the fog twice as thick at the lookout, eased in over the lift's first 4 s
const smooth = t => t * t * (3 - 2 * t);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Makes the three far friends at their places (`spots`: the layout's farFriends, { name: [x, z] }) and keeps them updated on
 * world.effects until they are disposed of. Call it as the chapter starts: their models load and their light levels are made
 * behind the start button. Uggeðla is kept back until the camera has turned away from her (findFriends): from the lift and the
 * look down at Mosi she would show at the edge of the frame before the child is asked to look.
 */
export function farFriends(s, c, spots) {
  const { world } = c;
  const friends = Object.fromEntries(Object.entries(FRIENDS).map(([name, { y, ...spec }]) => {
    const [x, z] = spots[name];
    const reed = spec.reed && { ...spec.reed, toward: Math.atan2(LOOKOUT_HEAD[2] - z, LOOKOUT_HEAD[0] - x) }; // thickest on the lookout's side
    return [name, { ...spec, ...(reed && { reed }), position: [x, y, z] }];
  }));
  const far = createFarFriends(world, { friends, sun: world.lighting?.sun });
  far.withhold(LAST, true);
  const height = () => world.renderer?.domElement?.height || 800;
  world.effects.add({ label: 'far friends', update: dt => { far.update(dt, world.camera, height()); return !far.disposed; } });
  return far;
}

/**
 * The fog's density eased to `factor` times the look's own over `seconds` (a uniform every material reads: no cost). Up on her
 * head the Fen lies under twice the haze, so the far trees fade and the plain reads far below; it eases back for the slide.
 */
export function haze(c, factor, seconds) {
  const fog = c.world.scene?.fog;
  if (!fog || !Number.isFinite(fog.density)) return;
  c.fogDensity ??= fog.density; // the look's own
  const from = fog.density, to = c.fogDensity * factor;
  let age = 0;
  const ease = { label: 'haze', update: dt => {
    if (c.haze !== ease) return false; // a newer one took over
    age += dt;
    fog.density = from + (to - from) * smooth(Math.min(1, age / seconds));
    return age < seconds;
  } };
  c.haze = ease;
  c.world.effects.add(ease);
}

/** The lookout's haze rises with the lift: call as scene 6 begins. */
export const hazeUp = c => haze(c, HAZE.up, HAZE.rise);

/**
 * At the top of the lift: he looks down at Mosi, small below on the bank beside her withers, and the camera looks down past him
 * (Task 3's LOOKOUT_CAMERA with its look down, kafli2-thorsedla.js): "Vá… Mosi er pínulítill!" once it has turned down to Mosi, so the
 * child sees what he sees. Mosi looks up at him: "Ég er ekki lítill, ég er langt í burtu!"
 */
export function* lookDown(s, c) {
  const { egill, mosi } = c;
  yield egill.lookAt(MOSI_HEAD, { weight: 0.9, maxAngle: 60, maxPitch: 50 });
  s.camera.follow('egill', { ...LOOKOUT_CAMERA, look: downToMosi(c) });
  yield s.wait(1.4);
  yield* c.say('egill', 'k2_egill_tiny');
  yield mosi.lookAt('egill.head', { weight: 0.85, maxAngle: 50, maxPitch: 50 });
  yield* c.say('mosi', 'k2_mosi_notsmall');
}

/**
 * "Horfðu vel, Egill. Sérðu vinina okkar?": the camera comes round behind him on his right and turns out over the Fen to the
 * north-west, and the child looks round for Slóeðla and Flugeðla glittering far away (s.search); then it turns round to the
 * east-south-east and Uggeðla glitters in her reed (a second s.search). Each one found glitters and does what she does, her place
 * flies onto the book's map, and Mosi names her; after the third: "Nú veistu hvar þau eru. Við skrifum það í bókina."
 */
export function* findFriends(s, c) {
  const { egill, mosi, world } = c;
  const far = c.farFriends;
  const first = far.targets.filter(t => FIRST.includes(t.name));
  const last = far.targets.filter(t => t.name === LAST);
  const onFound = (name, index, how) => found(s, c, name, how);
  c.farFinds = [];
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  const view = searchView(c, first);
  s.camera.follow('egill', { ...SEARCH_CAMERA, look: view.look });
  yield* c.say('thorsedla', 'k2_thorsedla_look');
  yield s.wait(SETTLE);
  // Egill looks where the child looks, and the friends glitter until each is found.
  yield egill.lookAt(alongTheView(world), { weight: 0.8, maxAngle: 70, maxPitch: 30 });
  for (const target of first) far.glimmer(target.name, true);
  yield s.search({ explore: { yaw: view.yaw, pitch: SEARCH_PITCH }, targets: first.map(withHint), ...PACE, quick: QUICK, onFound });
  // Uggeðla: round to the east-south-east, past her conifers. She is there now (behind the camera, unseen till it turns), glittering.
  far.withhold(LAST, false);
  far.glimmer(LAST, true);
  yield* turnRound(s, c, last[0].point);
  const helped = c.farFinds.at(-1)?.how === 'helped';
  yield s.search({ explore: LAST_LOOK, targets: last.map(withHint), ...(helped ? QUICK : PACE), onFound });
  // her last words up here over the Fen as the child left the view
  yield egill.lookAt(null);
  yield* c.say('thorsedla', 'k2_thorsedla_now');
}

const withHint = target => ({ ...target, hint: HINTS[target.name] });

/** A friend found: a pan to her if the view is not on her (found for the child), she does what she does, flies onto the map, Mosi names her. */
function* found(s, c, name, how) {
  const { world } = c;
  const far = c.farFriends;
  const target = far.targets.find(t => t.name === name);
  c.farFinds.push({ name, how, at: s.time });
  far.glimmer(name, false);
  if (how !== 'tapped' && !inView(world, target.point)) yield world.director.hint(target.point.clone(), { duration: 1.5 });
  s.sfx('flower');
  const reaction = far.react(name);
  s.place(name, screenOf(world, target.point));
  yield s.all(reaction, s.after(0.3, () => c.say('mosi', FOUND[name])));
}

/** Where the search's camera stands: his feet and SEARCH_CAMERA's offset (he faces +X at the top). */
function searchEye(c) {
  const feet = c.egill.raw.root.getWorldPosition(new THREE.Vector3());
  const [x, y, z] = SEARCH_CAMERA.offset;
  return new THREE.Vector3(feet.x + x, feet.y + y, feet.z + z);
}

/** A point 60 m out from `eye` along a bearing and a tilt (radians). */
const along = (eye, bearing, tilt) => eye.clone().add(new THREE.Vector3(Math.cos(bearing) * Math.cos(tilt), Math.sin(tilt), Math.sin(bearing) * Math.cos(tilt)).multiplyScalar(60));

/**
 * The first search's view: `look`, the point it looks at as it comes round, out between the two friends (SEARCH_LEAN to the left)
 * and SEARCH_DOWN degrees down; and `yaw`, how far the free look turns from there each way, to each friend and SEARCH_MARGIN more.
 */
function searchView(c, targets) {
  const eye = searchEye(c);
  const bearing = point => Math.atan2(point.z - eye.z, point.x - eye.x);
  const [a, b] = targets;
  const base = bearing(a.point) + wrap(bearing(b.point) - bearing(a.point)) / 2 + THREE.MathUtils.degToRad(SEARCH_LEAN);
  const turns = targets.map(t => THREE.MathUtils.radToDeg(wrap(bearing(t.point) - base)));
  const yaw = [Math.min(0, ...turns) - SEARCH_MARGIN, Math.max(0, ...turns) + SEARCH_MARGIN];
  return { look: along(eye, base, -THREE.MathUtils.degToRad(SEARCH_DOWN)).toArray(), yaw };
}

/**
 * The camera turns round where it stands, from the view the child left to Uggeðla (LAST_DOWN degrees under her), the short way
 * round, at TURN_SPEED degrees a second on average, eased in and out: the follow's look runs round a 60 m circle (its target may
 * move fast enough for that), and its place does not move.
 */
function* turnRound(s, c, point) {
  const { world } = c;
  const eye = searchEye(c);
  const dir = world.camera.getWorldDirection(new THREE.Vector3());
  const fromYaw = Math.atan2(dir.z, dir.x), fromTilt = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  const toYaw = Math.atan2(point.z - eye.z, point.x - eye.x);
  const toTilt = Math.atan2(point.y - eye.y, Math.hypot(point.x - eye.x, point.z - eye.z)) - THREE.MathUtils.degToRad(LAST_DOWN);
  const turn = wrap(toYaw - fromYaw);
  const seconds = Math.max(2.5, THREE.MathUtils.radToDeg(Math.abs(turn)) / TURN_SPEED);
  const start = s.time;
  const look = out => {
    const k = smooth(Math.min(1, (s.time - start) / seconds));
    return out.copy(along(eye, fromYaw + turn * k, fromTilt + (toTilt - fromTilt) * k));
  };
  s.camera.follow('egill', { ...SEARCH_CAMERA, look, maxSpeed: 24 });
  yield s.wait(seconds + 0.4);
}

/** A point 40 m out along the camera's view: what Egill looks at while the child looks round. */
function alongTheView(world) {
  const dir = new THREE.Vector3();
  return out => {
    world.camera.getWorldDirection(dir);
    if (dir.y < -0.4) dir.y = -0.4;
    return out.copy(world.camera.position).addScaledVector(dir.normalize(), 40);
  };
}

/** Is a point in the camera's view now (inside the middle 80 % of the frame)? */
function inView(world, point) {
  world.camera.updateMatrixWorld();
  const p = point.clone().project(world.camera);
  return p.z < 1 && Math.abs(p.x) < 0.8 && Math.abs(p.y) < 0.8;
}

/** Where a point is on the screen, in CSS pixels ({ x, y }), for the marker to fly from; the middle of the screen when it is behind. */
function screenOf(world, point) {
  const box = world.renderer?.domElement?.getBoundingClientRect?.();
  if (!box) return null;
  world.camera.updateMatrixWorld();
  const p = point.clone().project(world.camera);
  if (p.z >= 1) return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
}
