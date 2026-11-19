// The calls of the flight: she calls the animals by herself, and they answer. The flight is a film Egill watches and touches nothing in
// (the owner, 2026-11-15: docs/superpowers/specs/2026-11-15-kafli-4-flugmynd-design.md); the steering, „Hraðar!“, the skim and the taps
// on the animals of spec 6 went with it.
//
//   c.lines = lineQueue(s);           // the flight's voices: c.say(speaker, id) waits for a line playing; { ifQuiet: true } skips instead
//   const play = flightPlay(s, c);    // c: the flight's state (chapters/flug.js), with c.say and c.speaking
//   play.enable('call', true);        // C: she calls each group as she comes to it (off at D: any group left is called then)
//   play.update(t);                   // every frame, at the flight's time, after the flier
//   play.bigCall();                   // F: the big call over the land, by itself at 135 s
//   play.stop();                      // lets go of the lines
//
// The calls (C): a group 25 m ahead of her she calls by herself. Her call is one of three lines in turn, left out (not the call) while a
// line plays; the group answers 0.6 s after the call, once, from its side. A call shot's groups (the route's CALL_SHOTS) she calls at
// the row's own second, earlier: they hear her at once (animals.js hear: heads up, turned to her) and answer as she passes them
// (PLAY.runAfter after the row's pass); every second of it is the flight's, so a seek finds them where playing would have. F: the big call comes by itself at 135 s, waiting for the
// line playing; the answers come from everywhere after it, and Kambeðla's plates blink.
//
// The call shots' sound (the Flugmynd spec): her call in a call shot is heard from her side as its camera sees her (the line queue's
// `pan`, engine/scene/voice.js), the big call in the herd's too; at each one's pass a whoosh from her side (PLAY.whooshBefore before
// the row's `pass`, or before its cut where she passes after it: the ledge's) and a wingbeat as she is nearest its camera (its
// distance to her stops falling, from the call on). They are in `passes`, a seek's too (only the sounds are left out).
//
// The juice review of 2026-11-07 (its sections 1 and 2) added what is kept of it here: the life along the way heard (the fish, the early
// birds, the birds in the bank trees), from its side, and the gorge's flyers' cry as the first leaves its nest.
import * as THREE from 'three';
import { BEATS, CALL_SHOTS } from './kafli4-route.js';
import { splash, splashWarm } from '../world/props/splash.js';
import { glints } from '../world/props/sparkles.js';
import { FISH } from '../world/ardalur/life.js';

export const PLAY = {
  callAhead: 25, // metres ahead of her at which she calls a group by herself
  answerAfter: 0.6, // seconds from her call to the group's answer
  runAfter: 0.3, // a call shot's groups answer this long after she passes them (the row's pass)
  whooshBefore: 0.15, // a call shot's whoosh from her side, this long before she passes (the row's pass)
  bigCall: 135, // F: seconds into the flight at which the big call comes by itself
  // seconds after the big call: answers from everywhere, [after, sound, pan] (plan Task 16: frogs, birds and lizards, 0.4 to 0.9 aside;
  // the life plan's Task 17: the herd below her and the flyers round her)
  bigAnswers: [
    [3, 'frog', -0.7], [3.3, 'lizards', 0.6], [3.6, 'birds', 0.85], [3.9, 'grazers', -0.45], [4.3, 'frog', 0.5], [4.6, 'lizards', -0.45],
    [5, 'birds', -0.9], [5.4, 'flyers', 0.4], [5.8, 'grazers', 0.55],
  ],
  cryPan: 0.5, // the flyers' cry as the first leaves its nest (world/ardalur/life.js flyersOff), this far to its side of her
};
const CALLS = ['k4_flugedla_call1', 'k4_flugedla_call2', 'k4_flugedla_call3'];
// Egill's line for each kind of animal (the flight places them over the shot after a group's call shot)
export const TAPPED = { frogs: 'k4_egill_frogs', birds: 'k4_egill_birds', turtle: 'k4_egill_turtles', lizards: 'k4_egill_lizards', dragonflies: 'k4_egill_dragonflies' };
// Each group's answer among the game's sounds (sfx.js): the turtle's and the small lizards' are the owner's recordings (Task 16).
export const ANSWER = { frogs: 'frog', birds: 'birds', dragonflies: 'dragonfly', turtle: 'turtleCall', lizards: 'lizards' };

/**
 * The flight's voices, one at a time: a line asked for while another plays (or waits) waits its turn, so no line is cut or talked over.
 * `say(speaker, id, { ifQuiet, ifFree, onStart, pan })` returns the line's entry ({ task, started }), or null when `ifQuiet` and a
 * line plays, or `ifFree` and a line already waits its turn (it waits for the one playing, but not behind others). `pan` (-1..1, or
 * a function giving it as the line begins): heard from that side.
 */
export function lineQueue(s) {
  let current = null; // the task of the line playing
  const waiting = [];
  let pumping = false;
  const playing = () => current !== null && !current.done;
  function begin(entry) {
    const pan = typeof entry.pan === 'function' ? entry.pan() : entry.pan;
    current = Number.isFinite(pan) && pan !== 0 ? s.say(entry.speaker, entry.id, { pan }) : s.say(entry.speaker, entry.id);
    entry.task = current;
    entry.started = s.time;
    entry.onStart?.(entry);
  }
  function* pump() {
    try {
      while (waiting.length) {
        if (playing()) yield current;
        else begin(waiting.shift());
      }
    } finally {
      pumping = false;
    }
  }
  return {
    get speaking() { return playing() || waiting.length > 0; },
    say(speaker, id, { ifQuiet = false, ifFree = false, onStart = null, pan = null } = {}) {
      const entry = { speaker, id, onStart, pan, task: null, started: null };
      if (playing() || waiting.length) {
        if (ifQuiet || (ifFree && waiting.length)) return null;
        waiting.push(entry);
        if (!pumping) {
          pumping = true;
          s.after(0, () => pump());
        }
        return entry;
      }
      begin(entry);
      return entry;
    },
  };
}

export function flightPlay(s, c) {
  const { world, flier, route } = c;
  const on = { call: false };
  const flightTime = () => s.time - c.flight.started;
  const calls = []; // { id (a group's, or 'land'), how ('auto', or 'shot': a call shot's), t, voiced }
  const answers = []; // { id, t }
  let last = null; // the flight's time at the last update
  const effects = Boolean(world.effects && world.scene); // the splashes need them (none in a test's bare world)
  const life = world.forest?.life ?? null;
  const panOfPoint = point => (world.camera?.updateMatrixWorld ? panOf(world, point) : 0);
  const herSide = () => panOfPoint(flier.pose.position); // where she is across the speakers, as the camera sees her now

  // a splash and a set of plain glints nobody sees (the splash's lit program, the sparkles'), drawn once now as the flight starts in
  // the black, so their first draw is not mid-flight (a stall of some 0.1 s: main.js), for the review flight, which has no falls built
  // before it nor sparkles
  if (!s.seeking && world.warmObjects && effects) {
    const warm = [splashWarm(world), glintsWarm(world)];
    world.warmObjects(warm.map(w => w.object));
    for (const w of warm) w.dispose();
  }

  // ---- The calls -------------------------------------------------------------------------------------------------------------------
  const animalOf = id => world.forest?.animals?.groups.find(g => g.id === id) ?? null;
  const groups = route.groups.map(g => ({ id: g.id, kind: g.kind, at: g.at, u: g.u, called: false }));
  let nextCall = 0;
  const pointOf = g => animalOf(g.id)?.point ?? new THREE.Vector3(...g.at);
  function callGroup(g, how) {
    if (g.called) return;
    g.called = true;
    const voiced = c.say('flugedla', CALLS[nextCall % CALLS.length], { ifQuiet: true }) !== null;
    if (voiced) nextCall++;
    calls.push({ id: g.id, how, t: flightTime(), voiced });
    s.after(PLAY.answerAfter, () => answer(g));
  }
  function answer(g, run = undefined) {
    const animal = animalOf(g.id);
    if (animal && !animal.answered) animal.answer(run);
    if (ANSWER[g.kind]) s.sfx(ANSWER[g.kind], { pan: panOfPoint(pointOf(g)) });
    answers.push({ id: g.id, t: flightTime() });
  }
  // A call shot's row: her one call to its groups at its second, heard by them from that second (on the game clock: the call's
  // second, not the frame's), and their answers after she passes; a row's early groups answer as an auto call's do, PLAY.answerAfter
  // after it, with their own run up the bank (the run-along's lizards-2: already running as the shot begins)
  const shotRows = CALL_SHOTS.map(row => ({ row, groups: groups.filter(g => [row.group, ...(row.also ?? [])].includes(g.id)), done: false }))
    .filter(r => r.groups.length);
  const inRow = new Set(shotRows.flatMap(r => r.groups.map(g => g.id)));
  function callRow(r) {
    r.done = true;
    const late = flightTime() - r.row.call;
    const voiced = c.say('flugedla', CALLS[nextCall % CALLS.length], { ifQuiet: true, pan: herSide }) !== null;
    if (voiced) nextCall++;
    for (const g of r.groups) {
      if (g.called) continue;
      g.called = true;
      calls.push({ id: g.id, how: 'shot', t: flightTime(), voiced });
      animalOf(g.id)?.hear?.((world.clock?.time ?? s.time) - late);
      const early = r.row.early?.[g.id] ?? null;
      const at = early ? r.row.call + PLAY.answerAfter : r.row.pass + PLAY.runAfter;
      s.after(Math.max(0, at - flightTime()), () => answer(g, early ?? undefined));
    }
  }
  function groupsFrame() {
    if (!on.call || flightTime() >= BEATS.D) return;
    for (const r of shotRows) if (!r.done && flightTime() >= r.row.call - 1e-6) callRow(r);
    for (const g of groups) {
      if (g.called || inRow.has(g.id)) continue; // a call shot's group waits for its row's second
      const ahead = (g.u - flier.u) * route.length;
      if (ahead <= PLAY.callAhead) callGroup(g, 'auto');
    }
  }

  // F: the big call over the land, once, by itself at 135 s; it waits for the line playing
  const big = { how: null, at: null };
  function bigCall(how = 'auto') {
    if (big.how) return;
    big.how = how;
    c.say('flugedla', 'k4_flugedla_call1', {
      pan: herSide, // from the herd's call shot, as its camera sees her
      onStart: () => {
        big.at = flightTime();
        calls.push({ id: 'land', how, t: big.at, voiced: true });
        world.forest?.farLand?.kambedla?.answerAt?.(big.at);
        world.forest?.life?.bigCall?.(big.at); // the rows of small lizards and the flocks set off (world/ardalur/life.js)
        for (const [after, name, pan] of PLAY.bigAnswers) s.after(after, () => { s.sfx(name, { pan }); });
      },
    });
  }

  // Each call shot's pass: a whoosh from her side PLAY.whooshBefore before the row's pass (or its cut, where she passes after it),
  // and a wingbeat as she is nearest its camera: the first frame its distance to her grows after falling, from the call on (none
  // where she is still coming at the cut). Only while the camera is on the row's shot; logged even while seeking.
  const passes = CALL_SHOTS.map(row => ({ id: row.id, row, whoosh: null, side: null, wingbeat: null, last: null, falling: false }));
  function passFrame(t) {
    const eye = world.camera?.position;
    if (!eye) return;
    for (const p of passes) {
      const { row } = p;
      if (t < row.from || t > row.to || c.camera?.current !== row.shot) continue;
      const her = flier.pose.position;
      if (p.whoosh === null && t >= Math.min(row.pass, row.to) - PLAY.whooshBefore) {
        p.whoosh = t;
        p.side = herSide() / 0.8; // panOf keeps a little short of the ends: her side, -1..1
        if (!s.seeking) c.sounds?.whoosh?.(p.side);
      }
      const d = her.distanceTo(eye);
      const rising = p.last !== null && d > p.last + 1e-4;
      if (p.wingbeat === null && rising && p.falling && t >= row.call) {
        p.wingbeat = t;
        if (!s.seeking) c.sounds?.wingbeat?.();
      }
      if (p.last !== null) p.falling = d < p.last - 1e-4 ? true : rising ? false : p.falling;
      p.last = d;
    }
  }

  // D: the gorge's flyers cry as the first of them leaves its nest (world/ardalur/life.js flyersOff), once, from its side of her; not
  // where the flight starts past it (a seek), nor in a world with no flyers (the review flight's)
  let cried = false;
  function cryFrame(before, t) {
    const off = world.forest?.life?.flyersOff ?? null;
    if (cried || !off || before === null || before >= off.at || t < off.at) return;
    cried = true;
    s.sfx('flyers', { pan: off.side === 'right' ? PLAY.cryPan : -PLAY.cryPan });
  }

  // The life along the way heard as it sets off (world/ardalur/life.js things, each at its trigger), from its side: a fish's plip as
  // it jumps and its splash as it falls back, with a ring in the water each time and a small splash; an early bird's call and
  // wings; the birds of a bank tree as they fly up (one sound a tree)
  const treesHeard = new Set();
  function lifeFrame(before, t) {
    if (!life || before === null || s.seeking || !(t > before)) return;
    for (const b of life.things) {
      if (b.trigger === null || !(b.trigger > before && b.trigger <= t)) continue;
      if (b.kind === 'fish') {
        const out = b.at;
        const back = new THREE.Vector3(out.x + b.dir[0] * FISH.across, out.y, out.z + b.dir[1] * FISH.across);
        s.sfx('fish', { part: 'out', pan: panOfPoint(out) });
        world.forest?.rippleAt?.(out.x, out.z, 0.5);
        s.after(FISH.seconds, () => {
          s.sfx('fish', { part: 'in', pan: panOfPoint(back) });
          world.forest?.rippleAt?.(back.x, back.z, 0.6);
          if (effects) splash(world, back, { size: 0.35, count: 14, seed: `${b.id} in` });
        });
      } else if (b.kind === 'earlyBird') s.sfx('earlyBird', { pan: panOfPoint(b.at) });
      else if (b.kind === 'bird' && !b.flock) {
        const tree = b.id.replace(/-bird-\d+$/, '');
        if (treesHeard.has(tree)) continue;
        treesHeard.add(tree);
        s.sfx('earlyBird', { pan: panOfPoint(b.at) });
      }
    }
  }

  return {
    calls, answers, big, passes,
    enable(kind, value) {
      if (!(kind in on)) throw new Error(`Unknown flight play "${kind}" (use call)`);
      on[kind] = Boolean(value);
      // the calls of C end with it: any group still not called is called now, so every group is called once
      if (kind === 'call' && !value) for (const g of groups) if (!g.called) callGroup(g, 'auto');
    },
    bigCall,
    update(t) {
      const before = last;
      last = t;
      groupsFrame();
      passFrame(t);
      cryFrame(before, t);
      lifeFrame(before, t);
    },
    stop() {},
  };
}

/** Where `point` is across the speakers from the camera now: -1 on the left to 1 on the right (a little short of the ends). */
export function panOf(world, point) {
  const camera = world.camera;
  camera.updateMatrixWorld();
  const local = point.clone().applyMatrix4(camera.matrixWorldInverse);
  const across = local.x / (Math.hypot(local.x, local.z) || 1);
  return Math.max(-1, Math.min(1, across)) * 0.8;
}

/** A set of plain glints nobody sees (the sparkles' program), for a warm-up's objects. */
function glintsWarm(world) {
  const set = glints(world, { count: 4, life: 1, spread: 0.2, fall: 0, size: 0.2, colour: '#ffe28a', seed: 'glints warm-up' });
  for (let i = 0; i < 4; i++) set.position.set([0, -1000, 0], i * 3);
  set.uniforms.uTime.value = 0.2;
  set.points.visible = false;
  return { object: set.points, dispose: () => set.remove() };
}
