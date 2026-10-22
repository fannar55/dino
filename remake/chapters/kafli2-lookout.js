// Chapter 2's lookout (remake/chapters/kafli2.js, scene 6): up on Þórseðla's head Egill finds the three friends far away, each
// glittering where she is, and each goes onto the book's map (the fifth task of the plan). The pieces the scene calls, with their
// constants and helpers:
//   farFriends(s, c, spots)  the three of them (world/props/far-friends.js), made behind the start button so that their models and
//                            light levels are ready long before the Fen; shown from the Fen on, and only from above 6 m
//   lookDown(s, c)           at the top, the camera looks down past Egill at Mosi: "Vá… Mosi er pínulítill!", and Mosi's answer
//   findFriends(s, c)        "Horfðu vel, Egill…", the camera turns out over the Fen and the child looks round for them: a hint for
//                            each (a pan there and Mosi's line) at 12, 24 and 36 s, and at 48 s she is found for the child; each
//                            found glitters, does what she does (far-friends.js: react), flies onto the map and Mosi names her
// `c` is the chapter's shared state; the finds are kept in c.farFinds ({ name, how, at }) for captures and probes.
import * as THREE from 'three';
import { createFarFriends } from '../world/props/far-friends.js';
import { LOOKOUT_CAMERA, MOSI_HEAD, downToMosi } from './kafli2-thorsedla.js';

// The friends, in the order the script hints them (Slóeðla, Flugeðla, Uggeðla: k2_mosi_hint_far1..3): where each stands in the
// Fen (the layout's farFriends), which way she faces (a three-quarter view from the lookout, so the crest, the wings and the sail
// read), and what she does while she waits.
const FRIENDS = {
  sloedla: { heading: 64, clip: 'wade', y: 0 }, // wading in the far pool (p5): a few slow steps now and then
  flugedla: { heading: 55, clip: 'idle', y: 0, perch: 'snag' }, // on top of the white snag, facing the lookout
  uggedla: { heading: -64, clip: 'idle', y: 0, sink: 2.2 }, // lying low in the reed, her back and her sail up out of it
};
const HINTS = { sloedla: 'k2_mosi_hint_far1', flugedla: 'k2_mosi_hint_far2', uggedla: 'k2_mosi_hint_far3' };
const FOUND = { sloedla: 'k2_mosi_found_sloedla', flugedla: 'k2_mosi_found_flugedla', uggedla: 'k2_mosi_found_uggedla' };

// The camera of the search: behind Egill on his right, 2 m above his feet, over her neck and back curving away below. It turns out
// over the Fen to the north-west, between Slóeðla and Flugeðla, so the first two friends glitter in the frame as the free look
// begins, and Uggeðla, to the east-south-east past her conifers, is a long turn to the right (the three bearings span 187 degrees from
// up here; s.search's explore turns from the first two's middle as far as each friend and 12 degrees more, 30 down and 10 up). From
// here the line to Uggeðla passes 4.8 m clear of the south-east conifer's crown, which hides her from his head (the layout's sight
// line from it passes 1.3 m from its axis at 9.3 m): the search is seen from here, not from his eyes.
const SEARCH_CAMERA = { offset: [-3.2, 2.0, 2.4], local: true, stiffness: 1.6, fov: 46, maxSpeed: 2.4 };
const SEARCH_PITCH = [-30, 10]; // degrees the free look tilts down and up
const SEARCH_MARGIN = 12; // degrees the free look turns past the friend furthest round on each side
const SEARCH_DOWN = 2; // degrees under the level the view looks as it turns out: the far Fen fills the lower part of the frame
const SEARCH_LEAN = 4; // degrees the view turns out to the right of the first two friends' middle: her tail's tip, rising behind her
//                       12 m from the camera, stays out of the bottom left of the frame, and both friends in it
// Hints at 12, 24 and 36 s and a find at 48 s (STYLE.md 10) for the first friend; once one was found for the child the next
// ones come sooner (hints every 6 s, found at 24 s), so a child who taps nothing is through the lookout in under two minutes.
const QUICK = { hintAfter: 6, helpAfter: 3 };
const SETTLE = 1.6; // seconds the camera turning out over the Fen has to come to rest before the free look starts from it

/**
 * Makes the three far friends at their places (`spots`: the layout's farFriends, { name: [x, z] }) and keeps them updated on
 * world.effects. Call it as the chapter starts: their models load and their light levels are made behind the start button.
 */
export function farFriends(s, c, spots) {
  const { world } = c;
  const friends = Object.fromEntries(Object.entries(FRIENDS).map(([name, { y, ...spec }]) => [name, { ...spec, position: [spots[name][0], y, spots[name][1]] }]));
  const far = createFarFriends(world, { friends, sun: world.lighting?.sun });
  const height = () => world.renderer?.domElement?.height || 800;
  world.effects.add({ label: 'far friends', update: dt => { far.update(dt, world.camera, height()); return true; } });
  return far;
}

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
 * "Horfðu vel, Egill. Sérðu vinina okkar?": the camera comes round behind him on his right and turns out over the Fen, and the
 * child looks round for the three friends glittering far away (s.search). Each one found glitters and does what she does, her
 * place flies onto the book's map, and Mosi names her; after the third: "Nú veistu hvar þau eru. Við skrifum það í bókina."
 */
export function* findFriends(s, c) {
  const { egill, mosi, world } = c;
  const far = c.farFriends;
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  const view = searchView(c);
  s.camera.follow('egill', { ...SEARCH_CAMERA, look: view.look });
  yield* c.say('thorsedla', 'k2_thorsedla_look');
  yield s.wait(SETTLE);
  // Egill looks where the child looks, and the friends glitter until each is found.
  yield egill.lookAt(alongTheView(world), { weight: 0.8, maxAngle: 70, maxPitch: 30 });
  for (const target of far.targets) far.glimmer(target.name, true);
  c.farFinds = [];
  yield s.search({
    explore: { yaw: view.yaw, pitch: SEARCH_PITCH },
    targets: far.targets.map(target => ({ ...target, hint: HINTS[target.name] })),
    quick: QUICK,
    onFound: (name, index, how) => s.after(0, () => found(s, c, name, how)),
  });
  for (const target of far.targets) far.glimmer(target.name, false);
  // her last words up here over the Fen as the child left the view, on whoever was found last
  yield egill.lookAt(null);
  yield* c.say('thorsedla', 'k2_thorsedla_now');
}

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

/**
 * The search's view, from where its camera stands (his feet and SEARCH_CAMERA's offset: he faces +X at the top): `look`, the point
 * it looks at as it comes round, 60 m out between the first two friends and SEARCH_DOWN degrees down; and `yaw`, how far the free
 * look turns from there each way, to each friend and SEARCH_MARGIN more.
 */
function searchView(c) {
  const feet = c.egill.raw.root.getWorldPosition(new THREE.Vector3());
  const [x, y, z] = SEARCH_CAMERA.offset;
  const eye = new THREE.Vector3(feet.x + x, feet.y + y, feet.z + z);
  const bearing = point => Math.atan2(point.z - eye.z, point.x - eye.x);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const [first, second] = c.farFriends.targets;
  const base = bearing(first.point) + wrap(bearing(second.point) - bearing(first.point)) / 2 + THREE.MathUtils.degToRad(SEARCH_LEAN);
  const turns = c.farFriends.targets.map(t => THREE.MathUtils.radToDeg(wrap(bearing(t.point) - base)));
  const yaw = [Math.min(0, ...turns) - SEARCH_MARGIN, Math.min(178, Math.max(0, ...turns) + SEARCH_MARGIN)];
  const down = THREE.MathUtils.degToRad(SEARCH_DOWN);
  const along = new THREE.Vector3(Math.cos(base) * Math.cos(down), -Math.sin(down), Math.sin(base) * Math.cos(down));
  const look = eye.clone().addScaledVector(along, 60);
  return { look: look.toArray(), yaw };
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
