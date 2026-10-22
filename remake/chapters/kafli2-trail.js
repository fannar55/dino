// Chapter 2's trail (remake/chapters/kafli2.js, scenes 1 and 2): where Þórseðla's ten prints lie down the fen half of it, where
// Mosi waits by each and where the camera stands, and the counting itself, one to ten, that scene 2 calls:
//   arriveOnTheTrail(s, c)   under the black: Mosi at the top of the trail with Egill on his back, the prints and their animals
//   countPrints(s, c)        the child counts the ten, the camera following Mosi from print to print
// with the places and shots the scene uses (TRAIL_PATH, TRAIL_PRINTS, RIDE_POINTS, RIDE_CAMERA, mosiAt, printsLow, printShot,
// printFollow). `c` is the chapter's shared state; `c.say(speaker, id)` says a line one voice at a time (kafli2.js).
import * as THREE from 'three';
import { holdWithHands } from '../engine/hand-hold.js';
import { createCritters } from '../world/critters/critters.js';
import { createMudPrints } from '../world/props/mud-prints.js';
import { sparkleTrail } from '../world/props/sparkles.js';

// The path from the glade's side in the north-west down to the Fen in the south-east (the trail's layout path, kafli2.js).
export const TRAIL_PATH = [[-46, -30], [-26, -17], [-12, -8], [0, 0], [12, 7], [26, 14], [46, 24]];

// Þórseðla's ten footprints down the fen half of the trail, the way she walked to the Fen: a 22 m sauropod's walk scaled down to
// read on a tablet (her real stride, one foot to the same foot again, is about 4 m; here it is 4.6), her hind feet in turn, left
// and right, PRINT_PACE m along the path apart and PRINT_GAUGE m either side of its middle, each toe turned a little out, as a
// sauropod's were. The first is 4 m past the middle of the blend, where the trail is all fen; the ten end 21 m on, in the mist.
const PRINT_FROM = 57.5; // m along the path to the first print
const PRINT_PACE = 2.3; // m along the path from one print to the next
const PRINT_GAUGE = 0.45; // m from the middle of the path to the middle of a print: her left and right prints never touch
const PRINT_TURN = 8; // degrees a print's toes turn out
/** Where a path is `s` metres along it, and its way there (unit). */
export function pathAt(path, s) {
  let i = 0;
  for (; i < path.length - 2; i++) {
    const leg = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (s <= leg) break;
    s -= leg;
  }
  const [ax, az] = path[i], [bx, bz] = path[i + 1];
  const leg = Math.hypot(bx - ax, bz - az);
  return { x: ax + ((bx - ax) * s) / leg, z: az + ((bz - az) * s) / leg, dx: (bx - ax) / leg, dz: (bz - az) / leg };
}
/** The prints: the first is her right foot's, on the south-west side of the path (the camera's), and so on in turn. */
function printsAlong(path) {
  return Array.from({ length: 10 }, (_, k) => {
    const p = pathAt(path, PRINT_FROM + PRINT_PACE * k);
    const right = k % 2 === 0 ? 1 : -1; // her right foot on the right of the way down: (-dz, dx)
    const heading = (Math.atan2(p.dz, p.dx) * 180) / Math.PI + right * PRINT_TURN;
    return { position: [p.x - p.dz * PRINT_GAUGE * right, p.z + p.dx * PRINT_GAUGE * right], heading, foot: right > 0 ? 'right' : 'left' };
  });
}
export const TRAIL_PRINTS = printsAlong(TRAIL_PATH);

// Scene 2. Mosi rides Egill down from the forest half (RIDE_FROM m along the path) to the first print, then waits beside each print
// in turn on its north-east side (the left of the way down), his head over it: MOSI_BACK m back along the path from it and MOSI_SIDE
// m out, clear of the path, so his feet are never in her prints. The camera stands across the path from him, low, with the print
// near it and Mosi with Egill on his back beyond (printShot: PRINT_SHOT, metres along the path from the print, out from its middle
// and up from the ground).
export const RIDE_FROM = 44;
const MOSI_BACK = 3.2;
const MOSI_SIDE = 2.3;
export const RIDE_POINTS = [49, 52].map((s, i) => {
  const p = pathAt(TRAIL_PATH, s);
  const out = [0.6, 1.4][i];
  return [p.x + p.dz * out, p.z - p.dx * out];
});
export const TRAIL_ON = [82, 88].map(s => { const p = pathAt(TRAIL_PATH, s); return [p.x + p.dz * MOSI_SIDE, p.z - p.dx * MOSI_SIDE]; });
// The ride's camera: behind Mosi on his right, a little above Egill, looking past Mosi's head down the trail.
export const RIDE_CAMERA = { offset: [-6.2, 3.0, 2.8], local: true, look: 'head', lookOffset: [1.6, -1.0, 1.1], stiffness: 1.4, fov: 50 };
const PRINT_SHOT = { along: 3.6, out: 3.2, up: 1.6, aimAlong: -1.2, aimIn: 1.4, aimUp: 0.85, fov: 56 };
const TALL_CLOSER = 0.4; // of the way in to the print the print camera comes on a tall screen (printFollow)
// The ten ahead, as Mosi says what they are ("Þau eru risastór!"): low on the path behind the first, about a child's height up, the
// first print big in the near third, Mosi's front foot and leg beside it for its size, and the row on down the trail into the mist
// (shotAlong: metres along the path from print 1, out from its middle to the south-west, negative toward Mosi; up from the ground).
const PRINTS_LOW = { along: -3.2, out: 1.05, up: 1.2, aimAlong: 4, aimIn: 2.8, aimUp: -0.2, fov: 46 };
const PRINT_ON = 1.0; // s after a count before Mosi and the camera go on to the next: the number is up first
// Seconds the child may be idle before the hint, and before Egill taps the print himself; the quick ones once he has.
const PRINT_WAIT = { hint: 8, help: 16, quickHint: 4, quickHelp: 8 };
const NOD_DIP = { x: 0, y: -0.6, z: 0 };
// The animals that live in four of her prints (critters.js), each where it lives in its print (metres along it from its middle and
// to its right; on its floor, in the water, on its water) and which way it faces from the print's own way: a frog in the third,
// which hops out onto the middle of the path; a diving beetle swimming round in the sixth; a water strider on the ninth's water,
// which shoots off toward the toes; and a salamander in the tenth, which crawls out over the toes and back.
const PRINT_ANIMALS = [
  { print: 2, kind: 'frog', name: 'print-frog', along: -0.02, across: -0.12, on: 'floor', turn: -90 },
  { print: 5, kind: 'waterBeetle', name: 'print-beetle', along: -0.05, across: 0, on: 'water', turn: 0 },
  { print: 8, kind: 'waterStrider', name: 'print-strider', along: -0.1, across: 0, on: 'water', turn: 0 },
  { print: 9, kind: 'salamander', name: 'print-salamander', along: 0.14, across: 0.02, on: 'floor', turn: 0 },
];
const ANIMAL_SIZE = 1.1; // the animals in her prints a little larger again than the critters' own (already larger than life)

/** Where Mosi waits by print k: back along the path from it and out on its north-east side, facing down the trail. */
export function mosiAt(k) {
  const p = pathAt(TRAIL_PATH, PRINT_FROM + PRINT_PACE * k - MOSI_BACK);
  return { x: p.x + p.dz * MOSI_SIDE, z: p.z - p.dx * MOSI_SIDE, heading: (Math.atan2(p.dz, p.dx) * 180) / Math.PI };
}

/** The ten ahead from low behind the first, Mosi's front foot beside it (PRINTS_LOW). */
export function printsLow(c) {
  return shotAlong(c, 'prints low', 0, PRINTS_LOW);
}

/**
 * The camera for print k: a little way on down the trail and across the path from Mosi, low, looking back up it: the print near
 * and big in the lower middle, Mosi beyond it beside the path looking down at it, his face toward us, Egill on his back, and the
 * prints counted already behind them in the mud.
 */
export function printShot(c, k) {
  return shotAlong(c, `print ${k + 1}`, k, PRINT_SHOT);
}

/**
 * The same camera as it follows Mosi from print to print (director.follow: smooth, never faster than the style guide's dolly): where
 * print 1's shot stands, in Mosi's own frame as he waits there, and looking where the shot of the print it is on (c.focus) looks.
 */
export function printFollow(c) {
  const shot = printShot(c, 0), at = mosiAt(0);
  const h = THREE.MathUtils.degToRad(at.heading);
  const dx = shot.position[0] - at.x, dz = shot.position[2] - at.z;
  const local = (x, z) => [(x - at.x) * Math.cos(h) + (z - at.z) * Math.sin(h), -(x - at.x) * Math.sin(h) + (z - at.z) * Math.cos(h)];
  const [ox, oz] = local(shot.position[0], shot.position[2]);
  const offset = [ox, shot.position[1] - c.world.heightAt(at.x, at.z), oz];
  // On a tall screen the lens is wider up and down (director.js keeps the frame's width): the camera comes TALL_CLOSER of the way
  // in to the print and a little lower, and looks at the print and its number, so the print is big in the lower middle and Mosi
  // above it, not over an empty foreground.
  const [px, pz] = local(...TRAIL_PRINTS[0].position);
  const tall = [THREE.MathUtils.lerp(ox, px, TALL_CLOSER), offset[1] - 0.2, THREE.MathUtils.lerp(oz, pz, TALL_CLOSER)];
  const isTall = () => c.world.camera.aspect < 1;
  const lift = new THREE.Vector3(0, 0.45, 0);
  const look = out => (isTall() ? out.copy(c.prints.targets[c.focus].point).add(lift) : out.fromArray(printShot(c, c.focus).target));
  return { offset: () => (isTall() ? tall : offset), local: true, look, fov: PRINT_SHOT.fov, stiffness: 1.5 };
}

/** A shot set along the trail from print k (S: metres along the path from it, out from its middle, up from the ground). */
function shotAlong(c, label, k, S) {
  const at = pathAt(TRAIL_PATH, PRINT_FROM + PRINT_PACE * k + S.along);
  const aim = pathAt(TRAIL_PATH, PRINT_FROM + PRINT_PACE * k + S.aimAlong);
  const x = at.x - at.dz * S.out, z = at.z + at.dx * S.out; // across the path from Mosi (its south-west side)
  const tx = aim.x + aim.dz * S.aimIn, tz = aim.z - aim.dx * S.aimIn; // toward Mosi's side
  const ground = c.world.heightAt;
  return { label, position: [x, ground(x, z) + S.up, z], target: [tx, ground(tx, tz) + S.aimUp, tz], fov: S.fov };
}

/**
 * Waits for print k to be counted: a tap on it (the child's), or after a while Egill's. A tap on another print splashes it, and
 * Mosi says the next is there and nods to it. Idle PRINT_WAIT.hint s: the hint; PRINT_WAIT.help s: Egill taps it himself, and the
 * next waits only the quick times, until the child taps again. Resolves 'child' or 'egill'.
 */
function* waitForPrint(s, c, k, quick) {
  const names = c.prints.targets.map(t => t.name);
  const next = names[k];
  const queued = c.queuedTap;
  c.queuedTap = null;
  if (queued?.name === next) { c.lastTap = queued; return 'child'; } // tapped while the last number was said
  c.lastTap = null;
  c.waitingPrint = true;
  try {
    return yield* waitingForPrint(s, c, k, quick, names, next);
  } finally {
    c.waitingPrint = false;
  }
}

function* waitingForPrint(s, c, k, quick, names, next) {
  const wait = quick ? { hint: PRINT_WAIT.quickHint, help: PRINT_WAIT.quickHelp } : PRINT_WAIT;
  let since = s.time;
  let hinted = false;
  let telling = null;
  for (;;) {
    const left = (hinted ? wait.help : wait.hint) - (s.time - since);
    const tapped = yield s.race(s.tap(names, { auto: next }), s.wait(Math.max(0, left)));
    if (tapped === next) return 'child';
    if (tapped !== undefined) {
      const wrong = names.indexOf(tapped);
      splashPrint(s, c, wrong, 'child');
      nod(s, c, k);
      if (!telling || telling.done) telling = s.after(0, () => c.say('mosi', 'k2_mosi_nextprint'));
      since = s.time;
      hinted = false;
      continue;
    }
    if (!hinted) {
      hinted = true;
      nod(s, c, k);
      if (!c.saying) s.after(0, () => c.say('mosi', 'k2_mosi_hint_print'));
      continue;
    }
    yield* egillTaps(s, c, k);
    return 'egill';
  }
}

/** A print splashes (a tap on it), and the animal in it reacts and is found. */
function splashPrint(s, c, k, by) {
  c.printLog.push({ what: 'splash', index: k, at: s.time, by });
  c.prints.splash(k);
  const animal = PRINT_ANIMALS.find(a => a.print === k);
  if (animal) {
    c.printCritters.react(animal.name);
    s.found(animal.kind, by === 'child' ? c.lastTap : null);
  }
}

/** Print k is counted: a splash, its number rising out of the water as Mosi says it, and its water still and gold. A task. */
function countPrint(s, c, k, by) {
  splashPrint(s, c, k, by);
  c.printLog.push({ what: 'count', index: k, at: s.time, by });
  c.prints.count(k);
  s.after(0.5, () => { c.prints.done(k); });
  return s.all(c.say('mosi', `k2_mosi_${k + 1}`, { hold: 0.35 }), s.wait(1.2));
}

/** Mosi nods toward the next print: his look dips to it and comes back up. */
function nod(s, c, k) {
  const at = c.prints.targets[k].point;
  const low = out => out.copy(at).add(NOD_DIP);
  c.mosi.lookAt(low, { weight: 0.9, maxPitch: 45 });
  s.after(0.45, () => c.mosi.lookAt(at, { weight: 0.8, maxPitch: 40 }));
}

/** Egill taps print k himself: he points at it from the saddle, and glints fly from his hand to it. */
function* egillTaps(s, c, k) {
  const { world, egill } = c;
  const at = c.prints.targets[k].point;
  yield egill.lookAt(at, { weight: 0.85, maxPitch: 50 });
  const shoulder = egill.raw.model.getObjectByName('RightUpperArm');
  const from = new THREE.Vector3();
  const reach = out => {
    shoulder.getWorldPosition(from);
    return out.copy(at).sub(from).normalize().multiplyScalar(0.25).add(from);
  };
  const hand = egill.raw.model.getObjectByName('RightHand');
  const pointing = holdWithHands(world, egill.raw, { right: reach }).grip(0.3);
  yield s.wait(0.35);
  const start = hand.getWorldPosition(new THREE.Vector3());
  let u = 0;
  const glint = new THREE.Vector3();
  sparkleTrail(world, () => { u = Math.min(1, u + 1 / 12); return glint.lerpVectors(start, at, u); }, { duration: 0.4, count: 12, seed: `egill taps ${k}` });
  yield s.wait(0.4);
  s.after(0.5, () => { pointing.release(0.35); });
  s.after(0.9, () => egill.lookAt(null));
}

/** On the trail, under the black: Kambeðla stays in her glade; Mosi with Egill on his back at the top of the trail, in the forest;
 * Þórseðla's prints in the mud below, and the animals in four of them. */
export function arriveOnTheTrail(s, c) {
  const { world, kambedla, mosi } = c;
  kambedla.raw.root.visible = false;
  c.leavingWalk?.cancel();
  const start = pathAt(TRAIL_PATH, RIDE_FROM);
  mosi.place(start.x, start.z, (Math.atan2(start.dz, start.dx) * 180) / Math.PI);
  c.prints = createMudPrints(world, { prints: TRAIL_PRINTS, heightAt: world.heightAt });
  const animals = PRINT_ANIMALS.map(({ print, kind, name, along, across, on, turn }) => ({
    name, kind, position: c.prints.pointIn(print, along, across, on), heading: TRAIL_PRINTS[print].heading + turn, scale: ANIMAL_SIZE,
  }));
  c.printCritters = createCritters(world, { spots: animals, heightAt: c.prints.groundAt, ripple: (point, strength) => c.prints.rippleAt(point, strength) });
  s.camera.cut({ label: 'trail ride', position: { actor: 'mosi', part: 'feet', offset: RIDE_CAMERA.offset, local: true }, target: 'mosi.head', fov: RIDE_CAMERA.fov });
}

/**
 * The count (scene 2): every print is a target; the next to count glimmers, and the child taps it, or Egill does when the child
 * does not (waitForPrint); each counted, Mosi and the camera go on to the next. Ends with the ten counted, Mosi by the last.
 */
export function* countPrints(s, c) {
  const { mosi, egill } = c;
  // Every print is a target from now on; the next to count glimmers. A tap on the next splashes, its number rises out of the water
  // and Mosi says it; a tap on another splashes and Mosi nods to the right one.
  const names = c.prints.targets.map(t => t.name);
  for (const t of c.prints.targets) s.target(t.name, t);
  // A tap while Mosi says a number is not lost: on the next print it counts as soon as he has said it; on another, a splash.
  const unhear = names.map((name, i) => s.onTap(name, tap => {
    c.lastTap = tap;
    if (c.waitingPrint) return; // waitForPrint hears it
    if (i === c.nextPrint) c.queuedTap = tap;
    else splashPrint(s, c, i, 'child');
  }));
  let quick = false;
  let walking = null;
  for (let k = 0; k < names.length; k++) {
    c.prints.glimmer(k);
    c.nextPrint = k;
    const by = yield* waitForPrint(s, c, k, quick);
    quick = by === 'egill';
    c.prints.glimmer(null);
    c.nextPrint = k + 1;
    const counting = countPrint(s, c, k, by);
    if (k < names.length - 1) {
      // on to the next once the number is up: Mosi to his place beside it, the camera following him and turning to it
      const next = mosiAt(k + 1);
      walking = s.after(PRINT_ON, () => { c.focus = k + 1; return mosi.walkTo([next.x, next.z], { speed: 0.95 }); });
      s.after(PRINT_ON + 0.3, () => mosi.lookAt(c.prints.targets[k + 1].point, { weight: 0.8, maxPitch: 40 }));
      s.after(PRINT_ON + 0.5, () => egill.lookAt(c.prints.targets[k + 1].point, { weight: 0.7, maxPitch: 45 }));
    }
    yield counting;
  }
  for (const name of names) s.target(name, null);
  for (const stop of unhear) stop();
  if (walking) yield walking;
}
