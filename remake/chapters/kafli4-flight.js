// Chapter 4's flight on Flugeðla's back (spec 5): beats A to G in 170 s, as a film for a child who touches nothing.
//
//   yield* theFlight(s, c);   // c: { world, flugedla, egill, mosi, route, flier, camera, sounds, say, mark }
//
// Two things run side by side. The frames put her where the flight is at its own time (the flier: engine/flier.js) with Egill on her
// back, and let the wind bed follow her speed, bank and the water under her. The beats cut the shots (engine/camera/flight-camera.js),
// say the lines, run Mosi's two cameos and the slow second at the crest of the falls. Everything is timed from the flight's start,
// so the big moments come at their times whatever the frame rate, a pause holds them (the game clock stands still) and a seek
// lands on them. Under reduced motion the orbit is the still vista and there is no slow second.
//
// The animals' answers to her calls are the game's sounds for now; the animals themselves (Task 8), Grameðla's shadow and the golden
// light (Task 10), what Egill may do (Task 11) and the recorded voices and wind (Tasks 15 and 16) come later on these same beats.
import * as THREE from 'three';
import { BEATS, LEAP, FALLS } from './kafli4-route.js';

// The flight's lines (plan Task 15's WORDS, verbatim from spec 5 and 6; the full chapter adds the rest). The three marked * are the plan's
// own additions, which the owner hears first and may cut.
export const FLIGHT_WORDS = {
  k4_flugedla_hold: 'Haltu þér fast!',
  k4_egill_wow: 'Vááá!',
  k4_flugedla_call1: 'Hátíð í kvöld! Komið öll!',
  k4_flugedla_call2: 'Komið á Stjörnuhátíðina!', // *
  k4_flugedla_call3: 'Allir á hátíðina í kvöld!', // *
  k4_mosi_wait: 'Bíðið eftir mér!',
  k4_egill_vaa: 'Vá!',
  k4_mosi_shortcut: 'Ég fer styttri leiðina!',
  k4_egill_falls: 'Sjáðu fossinn!',
  k4_flugedla_up: 'Upp með honum!',
  k4_flugedla_gramedla: 'Þarna, handan fjallanna, býr Grameðla.',
  k4_egill_big: 'Er hún stór?',
  k4_flugedla_biggest: 'Stærst af öllum!',
  k4_egill_all: 'Ég sé allt!',
  k4_flugedla_wind: 'Takk fyrir vindinn, Egill.',
  k4_flugedla_pool: 'Sjáðu, fjarlæga tjörnin. Þar býr Slóeðla.',
  k4_egill_mosi: 'Ég sé Mosa!',
  k4_egill_laugh: 'Hí hí hí!', // * (what Egill may do: Task 11)
  k4_egill_faster1: 'Hraðar!',
  k4_egill_faster2: 'Hraðar!',
  k4_flugedla_holdon: 'Haltu þér!',
};

// Her calls on the animal groups of C, in turn (spec 5C: three versions), and each group's answer among the game's sounds (sfx.js);
// the small lizards have none yet (Task 16: recordings, with the owner's yes).
const CALLS = ['k4_flugedla_call1', 'k4_flugedla_call2', 'k4_flugedla_call3'];
const ANSWER = { frogs: 'frog', snails: 'snail', dragonflies: 'dragonfly', turtle: 'turtle', lizards: null };
const CALL_AHEAD = 2.2; // seconds before she passes a group that she calls to it
const MOSI_RUN = 4; // m/s: Mosi runs (the walk at about twice its own pace)
// The music (spec 8: the same theme louder through the flight, silent for the slow second, quieter as she glides down).
const MUSIC = { flight: 1.5, glide: 0.8 };
const SLOW = { at: 116.2, scale: 0.25, seconds: 1 }; // the crest of the falls: one second of the room's time at a quarter speed
const clamp = THREE.MathUtils.clamp;

/** The flight: returns at BEATS.END with her over the far pool. */
export function* theFlight(s, c) {
  const { world, flier, camera, sounds, route } = c;
  c.flight = { beat: null, started: s.time, ended: null };
  flier.update(0);
  const release = s.seeking ? null : world.sound?.hold?.(sounds);
  if (!s.seeking) sounds.start();
  try {
    yield s.all(frames(s, c), beats(s, c));
  } finally {
    c.flight.ended ??= s.time;
    world.clock?.setScale?.(1);
    camera.stop();
    sounds.stop();
    release?.();
    world.music?.setLevel?.(1, 2);
  }
  return c.flight;
}

// Every frame: her place at the flight's time, and the wind bed after her (a few times a second: its levels glide anyway).
function* frames(s, c) {
  const { flier, sounds, route } = c;
  const fallsAt = new THREE.Vector3(FALLS.face, (FALLS.top + FALLS.base) / 2, FALLS.z);
  let clip = null;
  let n = 0;
  while (c.flight.ended === null) {
    flier.update(Math.min(BEATS.END, s.time - c.flight.started));
    if (flier.clip !== clip) {
      if (!s.seeking && (flier.clip === 'takeOff' || flier.clip === 'fly')) sounds.wingbeat();
      clip = flier.clip;
    }
    if (!s.seeking && n++ % 3 === 0) {
      const p = flier.pose.position;
      sounds.setSpeed(flier.speed);
      sounds.setPan(flier.bank / 50);
      const water = route.waterAt(p.x, p.z, 2);
      sounds.water(water === null ? 0 : clamp(1 - (p.y - water - 2) / 20, 0, 1));
      sounds.falls(Math.min(1, (35 / Math.max(1, p.distanceTo(fallsAt))) ** 2));
    }
    yield;
  }
}

// The beats of spec 5, cue by cue, each at its time on the flight's clock.
function* beats(s, c) {
  const { world, camera, sounds, route, say, mark } = c;
  const mosi = c.mosi;
  const at = function* (time) {
    const left = time - (s.time - c.flight.started);
    if (left > 1e-9) yield s.wait(left);
  };
  const sfx = name => { if (name) s.sfx(name); };
  const whoosh = side => { if (!s.seeking) sounds.whoosh(side); };
  const hideMosi = () => { mosi.raw.root.visible = false; };
  const run = (path, heading) => {
    mosi.place(path[0][0], path[0][1], heading);
    mosi.raw.root.visible = true;
    return mosi.walkTo(path.slice(1), { speed: MOSI_RUN });
  };
  const headingAlong = path => THREE.MathUtils.radToDeg(Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]));
  hideMosi();

  // A. The take-off (0:00–0:15): close in front of Egill as she turns to him, then from below as she leaps and drops and her wings
  // snap open, and beside her as she climbs away.
  mark('A');
  camera.shot('face', { raise: 0.45, fov: 52 }); // perched, she holds her head high: a little higher and wider
  s.fade(0, 0.8); // up out of the black the review chapter starts in (a capture too: it starts black)
  yield* at(0.8);
  say('flugedla', 'k4_flugedla_hold');
  yield* at(3);
  camera.shot('belowTakeOff');
  yield* at(LEAP);
  world.music?.setLevel?.(MUSIC.flight, 2); // the theme rises as she leaps
  yield* at(LEAP + 1);
  whoosh(1);
  yield* at(5.2);
  say('egill', 'k4_egill_wow');
  yield* at(8);
  camera.shot('side');

  // B. Down to the river (0:15–0:35): the Fen rushes by, then low over the water ahead of her as she levels out over it.
  yield* at(BEATS.B);
  mark('B');
  camera.shot('chase');
  yield* at(25);
  camera.shot('waterLevel'); // ended a second before she shoots past it: a still shot pans 40 deg/s at most
  yield* at(28.3);
  camera.shot('chase');

  // C. Up the river and the call (0:35–1:20): she calls to each group on the banks as she comes to it and it answers; between the
  // chases, beside her, low over the water, Mosi in the shallows (his first cameo) and the bank where her shadow passes the turtle.
  yield* at(BEATS.C);
  mark('C');
  const groups = route.groups.map((g, i) => ({ ...g, call: CALLS[i % CALLS.length], passes: timeAt(route, g.u) }));
  const cues = [
    ...groups.flatMap(g => [
      { t: g.passes - CALL_AHEAD, act: () => say('flugedla', g.call) },
      { t: g.passes, act: () => sfx(ANSWER[g.kind]) },
    ]),
    { t: 44.5, act: () => camera.shot('side') },
    { t: 51, act: () => camera.shot('waterLevel') },
    { t: 54.5, act: () => camera.shot('chase') },
    // Mosi's first cameo: placed out of sight, he runs up the shallows splashing, seen from across the river as she passes him
    { t: 57.5, act: () => { run(route.cameos.bank.path, headingAlong(route.cameos.bank.path)); camera.shot('mosiBank'); } },
    { t: 58.2, act: () => sfx('splash') },
    { t: 59.8, act: () => say('mosi', 'k4_mosi_wait') },
    { t: 60.2, act: () => whoosh(-1) },
    { t: 61, act: () => sfx('splash') },
    { t: 63, act: () => { hideMosi(); camera.shot('bankShadow', { group: 'turtle' }); } },
    { t: 65.7, act: () => whoosh(1) },
    { t: 68, act: () => camera.shot('chase') },
    { t: 75, act: () => camera.shot('side') },
  ].sort((a, b) => a.t - b.t);
  for (const cue of cues) {
    yield* at(cue.t);
    cue.act();
  }

  // D. The gorge (1:20–1:45): walls close in; Egill's face in the wind, three quick shots between the rocks, them small from high in
  // the gorge, and Mosi up on the rim (his second cameo) taking the shorter way.
  yield* at(BEATS.D);
  mark('D');
  camera.shot('chase');
  yield* at(83);
  camera.shot('face');
  yield* at(84);
  say('egill', 'k4_egill_vaa');
  yield* at(86);
  camera.shot('side', { quick: true });
  whoosh(1);
  yield* at(87.5);
  camera.shot('face', { quick: true });
  whoosh(-1);
  yield* at(89);
  camera.shot('chase', { quick: true });
  whoosh(1);
  yield* at(90.5);
  camera.shot('gorgeHigh');
  yield* at(95.5);
  run(route.cameos.rim.path, headingAlong(route.cameos.rim.path));
  camera.shot('mosiRim');
  yield* at(96.3);
  say('mosi', 'k4_mosi_shortcut');
  yield* at(99.5);
  hideMosi();
  camera.shot('chase');

  // E. The falls (1:45–2:05): the roar grows; she flies at the falls and up with the falling water, seen from the side by the cliff;
  // at the crest one slow second with only the wind, and then they burst out of the spray.
  yield* at(BEATS.E);
  mark('E');
  yield* at(106);
  say('egill', 'k4_egill_falls');
  yield* at(108.3);
  say('flugedla', 'k4_flugedla_up');
  yield* at(110);
  camera.shot('fallsSide');
  yield* at(116);
  camera.shot('chase');
  yield* at(SLOW.at);
  if (!c.reduced) {
    world.music?.setLevel?.(0, 0.15);
    world.clock?.setScale?.(SLOW.scale);
    try {
      yield s.wait(SLOW.seconds * SLOW.scale); // a second of the room's time, a quarter of one of the game's
    } finally {
      world.clock?.setScale?.(1);
    }
    world.music?.setLevel?.(MUSIC.flight, 0.6);
    if (!s.seeking) sounds.wingbeat();
  }

  // F. Up into the golden light (2:05–2:30): the whole land wide; Grameðla beyond the mountains; her biggest call over the land and
  // the answers from everywhere; a slow circle round them as the music peaks (the still vista under reduced motion).
  yield* at(BEATS.F);
  mark('F');
  camera.shot('vista');
  yield* at(126.5);
  say('flugedla', 'k4_flugedla_gramedla');
  yield* at(130);
  say('egill', 'k4_egill_big');
  yield* at(131);
  camera.shot('side');
  yield* at(132.3);
  say('flugedla', 'k4_flugedla_biggest');
  yield* at(134);
  camera.shot('orbit');
  yield* at(135);
  say('flugedla', 'k4_flugedla_call1'); // the biggest call (Task 15: louder, with an echo)
  for (const [time, name] of [[138, 'frog'], [138.6, 'birds'], [139.3, 'frog'], [140, 'birds']]) {
    yield* at(time);
    sfx(name);
  }
  yield* at(141);
  say('egill', 'k4_egill_all');

  // G. Gliding down (2:30–2:50): calmer, the music quieter; her thanks, the far pool ahead, and Mosi tiny below on his way there.
  yield* at(BEATS.G);
  mark('G');
  camera.shot('chase');
  world.music?.setLevel?.(MUSIC.glide, 4);
  placeMosiBelow(c);
  yield* at(150.5);
  say('flugedla', 'k4_flugedla_wind');
  yield* at(154);
  say('flugedla', 'k4_flugedla_pool');
  yield* at(159);
  say('egill', 'k4_egill_mosi');
  yield* at(162);
  camera.shot('side');
  yield* at(BEATS.END);
  c.flight.ended = s.time;
}

// Mosi on the ground ahead of her as she glides down, off to her left so she does not hide him, running toward the far pool.
function placeMosiBelow(c) {
  const { route } = c;
  const u = route.progressAt(161);
  const p = route.pointAt(u);
  const tangent = route.tangentAt(u);
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const x = p.x - right.x * 22;
  const z = p.z - right.z * 22;
  const [px, pz] = route.pool.center;
  const toPool = new THREE.Vector2(px - x, pz - z);
  const run = Math.max(0, Math.min(40, toPool.length() - route.pool.radius - 4));
  toPool.normalize();
  c.mosi.place(x, z, THREE.MathUtils.radToDeg(Math.atan2(toPool.y, toPool.x)));
  c.mosi.raw.root.visible = true;
  if (run > 1) c.mosi.walkTo([[x + toPool.x * run, z + toPool.y * run]], { speed: MOSI_RUN });
}

/** The flight's time at which she reaches progress u on the route. */
function timeAt(route, u) {
  let lo = 0;
  let hi = BEATS.END;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (route.progressAt(mid) < u) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
