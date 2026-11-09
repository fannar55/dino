// What Egill may do on the flight (spec 6): steer her, call the animals, and „Hraðar!“. All of it is optional, and none of it moves the
// big moments: she flies the route on its schedule (engine/flier.js), and what he does only moves her aside, down to the water, or ahead
// for a while that she pays back before the falls.
//
//   c.lines = lineQueue(s);           // the flight's voices: c.say(speaker, id) waits for a line playing; { ifQuiet: true } skips instead
//   const play = flightPlay(s, c);    // c: the flight's state (chapters/flug.js), with c.say, c.speaking, c.doc (the page, or null)
//   play.enable('steer', true);       // 'steer' (B, C and D to 92 s), 'call' (C, and the land in F) or 'faster' (B to D)
//   play.update(t);                   // every frame, at the flight's time, after the flier
//   play.bigCall();                   // F: the big call over the land, by itself (once: a tap on the land may have asked for it already)
//   play.stop();                      // lets go of her, the targets, the button and the lines
//
// Steering: a finger drawn sideways moves her aside, steer(dx / (0.35 * width)); one drawn down over 40 px lowers her to skim the
// water, and where she touches it it splashes (rings in the water and the splash's sound) and Egill laughs, at most once in 10 s. Only
// in the chase shots: in any other shot, and after 92 s, she is given back to the route. A glowing dot shows the way in the first chase
// shot, until he steers.
//
// The calls (C): each group is a tap target twice its size, from 120 m ahead of her until it is called. A tap calls it at once; a
// group not tapped by 25 m ahead of her she calls by herself. Her call is one of three lines in turn, left out (not the call) while a
// line plays; the group answers 0.6 s after the call, once. F: the big call comes by itself at 135 s, or at once on a tap on the land
// (on nothing) before then, waiting for the line playing; the answers come from everywhere after it, and Kambeðla's plates blink.
//
// „Hraðar!“: a round button in the lower corner, shown in chase shots whenever a burst could start (flier.canBurst). A press: she
// bursts, the lens widens 8 degrees for its 2.5 s (camera.boost), the speed lines show, the wind gusts and her wings beat. Egill
// shouts on the first burst and every third after it (passed on to the next burst while a line plays), and she answers him.
//
// The juice review of 2026-11-07 (its sections 1 and 2) added: her four lines in B that tell him what he may do (PLAY.guide), each
// left out once he has done it; the splash you can see where she skims (world/props/splash.js), and Egill's laugh in three takes in
// turn; at a tap on a group a chime from its side and a burst of gold over it, its answer from its side, and Egill's line for its
// kind, once a kind; a soft glitter over the nearest group he may tap; the button squashed and sparkling as it is pressed (the book's
// sparks, engine/book/fx.js), and no speed lines under reduced motion; the life along the way heard (the fish, the early birds, the
// birds in the bank trees), from its side; and a whoosh when he steers her close to the bank or the gorge's wall at speed.
import * as THREE from 'three';
import { BEATS } from './kafli4-route.js';
import { FLIGHT } from '../engine/flier.js';
import { createSpeedLines } from '../world/props/speed-lines.js';
import { splash, splashWarm } from '../world/props/splash.js';
import { glints, run, sparkleBurst } from '../world/props/sparkles.js';
import { FISH } from '../world/ardalur/life.js';
import { sparkle } from '../engine/book/fx.js';
import { seededRandom } from '../engine/random.js';

export const PLAY = {
  steerWidth: 0.35, // of the screen's width: a drag that far is her whole lane's half width aside
  skimPx: 40, // a drag this far down skims
  steerLast: 92, // seconds: no steering after this (spec 6: the first part of D)
  touch: FLIGHT.skim + 0.3, // metres from her body down to the water within which she touches it
  ringEvery: 0.25, // seconds between rings in the water while she touches it
  laughEvery: 10, // seconds at least between Egill's laughs
  hint: 6, // seconds the steering hint shows at most
  targetAhead: 120, // metres ahead of her from which a group is a tap target
  callAhead: 25, // metres ahead of her at which she calls a group by herself
  answerAfter: 0.6, // seconds from her call to the group's answer
  targetSize: 2, // a group's target radius: this many times the group's own
  bigCall: 135, // F: seconds into the flight at which the big call comes by itself
  // seconds after the big call: answers from everywhere, [after, sound, pan] (plan Task 16: frogs, birds and lizards, 0.4 to 0.9 aside;
  // the life plan's Task 17: the herd below her and the flyers round her)
  bigAnswers: [
    [3, 'frog', -0.7], [3.3, 'lizards', 0.6], [3.6, 'birds', 0.85], [3.9, 'grazers', -0.45], [4.3, 'frog', 0.5], [4.6, 'lizards', -0.45],
    [5, 'birds', -0.9], [5.4, 'flyers', 0.4], [5.8, 'grazers', 0.55],
  ],
  cryPan: 0.5, // the flyers' cry as the first leaves its nest (world/ardalur/life.js flyersOff), this far to its side of her
  shoutEvery: 3, // Egill shouts on the first burst and every third after it
  // The juice review (2026-11-07). What she tells him he may do in B, each once, from its second until `late` seconds after it, when
  // no line plays, and not once he has done it ([second, line, late]): steering as the first chase shot begins, the button, the skim
  // as the shot low over the water shows it (her line ends as the chase comes back), and the animals, ending before C's calls.
  guide: [[16, 'k4_flugedla_steer', 3], [21.5, 'k4_flugedla_faster', 2.5], [25, 'k4_flugedla_skim', 1], [30.8, 'k4_flugedla_animals', 1]],
  splashEvery: 0.5, // seconds between splashes while she skims
  skimSplash: 0.7, // their size (splash.js: 1 is a body her size touching down)
  glitter: { ahead: 60, every: 0.9, count: 9, life: 1.3, size: 0.8, up: [1.5, 4], colour: '#ffe28a' }, // over the nearest group to tap
  burst: { count: 22, size: 0.9, spread: 3, up: 1.5 }, // the gold over a group he taps (seen 25 to 120 m off: big glints)
  pressShow: 0.22, // seconds the pressed button shows its squash and sparks before it goes
  bank: { aside: 2.5, speed: 11, edge: 4.5, low: 7, every: 5 }, // the whoosh by the bank: steered `aside` m or more, at `speed` m/s or
  // more, her body within `edge` m of the water's edge (past it over the bank) and `low` m over the water, at most every `every` s
};
const CALLS = ['k4_flugedla_call1', 'k4_flugedla_call2', 'k4_flugedla_call3'];
const SHOUTS = ['k4_egill_faster1', 'k4_egill_faster2'];
const HOLDONS = ['k4_flugedla_holdon', 'k4_flugedla_holdon2', 'k4_flugedla_holdon3']; // her answers to his „Hraðar!“, in turn
const LAUGHS = ['k4_egill_laugh', 'k4_egill_splash', 'k4_egill_laugh2']; // Egill as she skims, in turn
// Egill when a tap of his has called a group, once a kind
export const TAPPED = { frogs: 'k4_egill_frogs', birds: 'k4_egill_birds', turtle: 'k4_egill_turtles', lizards: 'k4_egill_lizards', dragonflies: 'k4_egill_dragonflies' };
// Each group's answer among the game's sounds (sfx.js): the turtle's and the small lizards' are the owner's recordings (Task 16).
export const ANSWER = { frogs: 'frog', birds: 'birds', dragonflies: 'dragonfly', turtle: 'turtleCall', lizards: 'lizards' };
const GROUP_RADIUS = 4; // metres: a group's own size where the grey valley has no animals to say it

/**
 * The flight's voices, one at a time: a line asked for while another plays (or waits) waits its turn, so no line is cut or talked over.
 * `say(speaker, id, { ifQuiet, ifFree, onStart })` returns the line's entry ({ task, started }), or null when `ifQuiet` and a line
 * plays, or `ifFree` and a line already waits its turn (it waits for the one playing, but not behind others).
 */
export function lineQueue(s) {
  let current = null; // the task of the line playing
  const waiting = [];
  let pumping = false;
  const playing = () => current !== null && !current.done;
  function begin(entry) {
    current = s.say(entry.speaker, entry.id);
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
    say(speaker, id, { ifQuiet = false, ifFree = false, onStart = null } = {}) {
      const entry = { speaker, id, onStart, task: null, started: null };
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
  const { world, flier, camera, route } = c;
  const doc = c.doc ?? null;
  const on = { steer: false, call: false, faster: false };
  const flightTime = () => s.time - c.flight.started;
  const calls = []; // { id (a group's, or 'land'), how ('tap' or 'auto'), t, voiced }
  const answers = []; // { id, t }
  const bursts = []; // { t, shout }
  const guided = []; // { id, t }: her lines that told him what he may do
  const tapped = []; // { id, kind, t }: Egill's lines at a group he called
  let last = null; // the flight's time at the last update
  const effects = Boolean(world.effects && world.scene); // the glints need them (none in a test's bare world)
  const life = world.forest?.life ?? null;
  const panOfPoint = point => (world.camera?.updateMatrixWorld ? panOf(world, point) : 0);

  // ---- Steering --------------------------------------------------------------------------------------------------------------------
  let drag = null; // the dragging finger's travel since it started: { x, y } in px
  let asked = false; // a steer or a skim is asked of her
  let skimming = false;
  let touching = false; // she skims and touches the water
  let nextRing = 0;
  let nextSplash = 0;
  let lastLaugh = -Infinity;
  let laughs = 0;
  let steered = false; // he has steered once: the hint goes
  let skimmed = false; // he has had her touch the water once
  const width = () => Math.max(320, doc?.defaultView?.innerWidth ?? globalThis.innerWidth ?? 1280);
  const mayGuide = t => on.steer && camera.current === 'chase' && t < PLAY.steerLast;
  const letGo = () => {
    if (asked) {
      flier.steer(0);
      flier.skim(false);
    }
    asked = false;
    skimming = false;
  };
  const offDrag = s.onDrag(event => {
    if (event.phase === 'start') drag = { x: 0, y: 0 };
    if (!drag) return;
    drag.x += event.dx;
    drag.y += event.dy;
    if (event.phase === 'end') {
      drag = null;
      letGo();
      return;
    }
    if (!mayGuide(flightTime())) {
      letGo();
      return;
    }
    flier.steer(THREE.MathUtils.clamp(drag.x / (PLAY.steerWidth * width()), -1, 1));
    asked = true;
    steered = true;
    const skim = drag.y > PLAY.skimPx;
    if (skim !== skimming) flier.skim(skim);
    skimming = skim;
  });

  // where she skims and touches the water: the splash (heard, and seen every half second), Egill's laugh (three takes in turn), and a
  // ring in the water every quarter of a second
  function skimFrame(t) {
    const p = flier.pose.position;
    const water = skimming ? route.waterAt(p.x, p.z, 2) : null;
    const now = water !== null && p.y - water <= PLAY.touch;
    if (now && !touching) {
      s.sfx('skim');
      skimmed = true;
      if (t - lastLaugh >= PLAY.laughEvery && c.say('egill', LAUGHS[laughs % LAUGHS.length], { ifQuiet: true })) {
        lastLaugh = t;
        laughs++;
      }
      nextRing = t;
      nextSplash = t;
    }
    if (now && t >= nextSplash) {
      if (effects && !s.seeking) splash(world, new THREE.Vector3(p.x, water, p.z), { size: PLAY.skimSplash, seed: `skim ${Math.round(t * 10)}` });
      nextSplash = t + PLAY.splashEvery;
    }
    if (now && t >= nextRing) {
      world.forest?.rippleAt?.(p.x, p.z, 1);
      world.forest?.life?.skim(p.x, p.z); // the water striders near it skate off (world/ardalur/life.js)
      nextRing = t + PLAY.ringEvery;
    }
    touching = now;
  }

  // ---- The calls -------------------------------------------------------------------------------------------------------------------
  const animalOf = id => world.forest?.animals?.groups.find(g => g.id === id) ?? null;
  const groups = route.groups.map(g => ({ id: g.id, kind: g.kind, at: g.at, u: g.u, name: `group:${g.id}`, called: false, targeted: false }));
  let nextCall = 0;
  const target = g => {
    const animal = animalOf(g.id);
    const point = animal?.point ?? new THREE.Vector3(...g.at);
    s.target(g.name, { point, radius: PLAY.targetSize * (animal?.radius ?? GROUP_RADIUS) });
    g.targeted = true;
  };
  const untarget = g => {
    if (g.targeted) s.target(g.name, null);
    g.targeted = false;
  };
  const pointOf = g => animalOf(g.id)?.point ?? new THREE.Vector3(...g.at);
  const saidKinds = new Set();
  function callGroup(g, how) {
    if (g.called) return;
    g.called = true;
    untarget(g);
    // a tap is answered at once: a chime from the group's side and a burst of gold over it (her call may wait for a line)
    if (how === 'tap') {
      const point = pointOf(g);
      if (!s.seeking) s.sfx('callChime', { pan: panOfPoint(point) });
      const { count, size, spread, up } = PLAY.burst;
      if (effects) sparkleBurst(world, point.clone().setY(point.y + up), { count, size, spread, seed: `call ${g.id}` });
    }
    const voiced = c.say('flugedla', CALLS[nextCall % CALLS.length], { ifQuiet: true }) !== null;
    if (voiced) nextCall++;
    calls.push({ id: g.id, how, t: flightTime(), voiced });
    s.after(PLAY.answerAfter, () => {
      const animal = animalOf(g.id);
      if (animal && !animal.answered) animal.answer();
      if (ANSWER[g.kind]) s.sfx(ANSWER[g.kind], { pan: panOfPoint(pointOf(g)) });
      answers.push({ id: g.id, t: flightTime() });
      // Egill, once a kind, at a group his tap called: after her call, not behind other lines
      const line = TAPPED[g.kind];
      if (how === 'tap' && line && !saidKinds.has(g.kind) && c.say('egill', line, { ifFree: true })) {
        saidKinds.add(g.kind);
        tapped.push({ id: line, kind: g.kind, t: flightTime() });
      }
    });
  }
  const offTaps = groups.map(g => s.onTap(g.name, () => { if (on.call && g.targeted) callGroup(g, 'tap'); }));
  function groupsFrame(t) {
    let nearest = null; // the nearest group he may tap, for the glitter
    let nearestAhead = Infinity;
    for (const g of groups) {
      if (g.called) continue;
      if (!on.call || flightTime() >= BEATS.D) {
        untarget(g);
        continue;
      }
      const ahead = (g.u - flier.u) * route.length;
      if (ahead <= PLAY.callAhead) callGroup(g, 'auto');
      else if (ahead <= PLAY.targetAhead && !g.targeted) target(g);
      if (g.targeted && ahead <= PLAY.glitter.ahead && ahead < nearestAhead) {
        nearest = g;
        nearestAhead = ahead;
      }
    }
    glitterFrame(nearest, t);
  }

  // A soft glitter over the nearest group he may tap, from 60 m: a few gold glints rising over it every 0.9 s, each 1.3 s long, so
  // at most two sets live (one draw call each); steady, with no twinkle (no blinking).
  let nextGlitter = 0;
  let glitters = 0;
  const glitterRandom = seededRandom('glitter');
  function glitterFrame(g, t) {
    if (!g || !effects || s.seeking || t < nextGlitter) return;
    nextGlitter = t + PLAY.glitter.every;
    const animal = animalOf(g.id);
    const point = pointOf(g);
    const radius = animal?.radius ?? GROUP_RADIUS;
    const { count, life: seconds, size, up, colour } = PLAY.glitter;
    const set = glints(world, {
      count, life: seconds, spread: 0.4, fall: 0, size, colour, seed: `glitter ${glitters++}`,
      look: { twinkle: 0, star: 0.6, glow: 0.9, rise: 1.2 },
    });
    for (let i = 0; i < count; i++) {
      const turn = glitterRandom() * Math.PI * 2;
      const out = Math.sqrt(glitterRandom()) * radius;
      set.position.set([point.x + Math.cos(turn) * out, point.y + up[0] + (up[1] - up[0]) * glitterRandom(), point.z + Math.sin(turn) * out], i * 3);
      set.birth[i] = (i / count) * 0.5;
    }
    run(world, set, seconds + 0.5, 'glitter');
  }

  // F: the big call over the land, once: by itself at 135 s, or on a tap on the land before then; it waits for the line playing
  const big = { how: null, at: null };
  function bigCall(how = 'auto') {
    if (big.how) return;
    big.how = how;
    c.say('flugedla', 'k4_flugedla_call1', {
      onStart: () => {
        big.at = flightTime();
        calls.push({ id: 'land', how, t: big.at, voiced: true });
        world.forest?.farLand?.kambedla?.answerAt?.(big.at);
        world.forest?.life?.bigCall?.(big.at); // the rows of small lizards and the flocks set off (world/ardalur/life.js)
        for (const [after, name, pan] of PLAY.bigAnswers) s.after(after, () => { s.sfx(name, { pan }); });
      },
    });
  }
  const offLand = s.onTap(null, () => { if (on.call && flightTime() >= BEATS.F) bigCall('tap'); });

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

  // A whoosh when he steers her close by the bank, or the gorge's wall, at speed: from that side, at most every 5 s
  let lastBank = -Infinity;
  function bankFrame(t) {
    const { aside, speed, edge, low, every } = PLAY.bank;
    if (!asked || s.seeking || Math.abs(flier.offset) < aside || flier.speed < speed || t - lastBank < every) return;
    const p = flier.pose.position;
    const near = route.river.nearest(p.x, p.z);
    const here = route.river.at(near.d);
    if (p.y - here.level > low || here.half - near.dist > edge) return;
    lastBank = t;
    c.sounds?.whoosh?.(flier.offset > 0 ? 1 : -1);
  }

  // B: her lines that tell him what he may do (PLAY.guide), each once in its window when no line plays and what it is about can be
  // done (`may`: the button showing, say), and not once he has done it (`done`)
  const done = {
    k4_flugedla_steer: () => steered,
    k4_flugedla_faster: () => bursts.length > 0,
    k4_flugedla_skim: () => skimmed,
    k4_flugedla_animals: () => calls.some(call => call.how === 'tap'),
  };
  const may = {
    k4_flugedla_steer: () => on.steer && camera.current === 'chase',
    k4_flugedla_faster: () => on.faster && (button ? !button.hidden : camera.current === 'chase' && flier.canBurst()),
    k4_flugedla_skim: () => on.steer,
    k4_flugedla_animals: () => true,
  };
  const guides = PLAY.guide.map(([at, id, late]) => ({ at, id, late, over: false }));
  function guideFrame(t) {
    for (const g of guides) {
      if (g.over || t < g.at) continue;
      if (t > g.at + g.late || done[g.id]()) {
        g.over = true;
        continue;
      }
      if (may[g.id]() && c.say('flugedla', g.id, { ifQuiet: true })) {
        g.over = true;
        guided.push({ id: g.id, t });
      }
    }
  }

  // ---- „Hraðar!“ -------------------------------------------------------------------------------------------------------------------
  const speedLines = createSpeedLines(world, world.camera);
  // drawn once now, as the flight starts in the black, so the first burst is not their first draw (a stall of some 0.1 s: main.js);
  // and with them a splash and a set of plain glints nobody sees (the splash's lit program, the gold's), for the review flight, which
  // has no falls built before it nor sparkles
  if (!s.seeking && world.warmObjects) {
    const warm = effects ? [splashWarm(world), glintsWarm(world)] : [];
    world.warmObjects([speedLines.mesh, ...warm.map(w => w.object)]);
    for (const w of warm) w.dispose();
  }
  let shoutDue = true;
  let sinceShout = 0;
  let holdons = 0;
  let boostUntil = -Infinity;
  let pressedUntil = -Infinity; // the pressed button shows its squash till then (game seconds)
  function press() {
    if (!button || button.hidden || s.time < pressedUntil || !flier.burst()) return;
    const t = flightTime();
    camera.boost(true);
    if (!c.reduced) speedLines.show(true); // under reduced motion the lens widens half as much and there are no lines
    boostUntil = t + FLIGHT.burst.seconds;
    // the press shows: squashed (style.css .flight-faster.is-pressed) and sparkling, for a moment before the button goes
    pressedUntil = s.time + PLAY.pressShow;
    button.classList.add('is-pressed');
    if (button.getBoundingClientRect) sparkle(button);
    if (!s.seeking) {
      c.sounds?.gust();
      c.sounds?.wingbeat();
      c.sounds?.burst?.(FLIGHT.burst.seconds);
    }
    // Egill on the first burst and every third after it; a burst while a line plays passes his shout on to the next
    sinceShout++;
    if (shoutDue || sinceShout >= PLAY.shoutEvery) shoutDue = true;
    let shout = null;
    if (shoutDue && !c.speaking) {
      shout = SHOUTS[bursts.filter(b => b.shout).length % SHOUTS.length];
      c.say('egill', shout);
      c.say('flugedla', HOLDONS[holdons++ % HOLDONS.length]);
      shoutDue = false;
      sinceShout = 0;
    }
    bursts.push({ t, shout });
  }
  const button = doc ? doc.createElement('button') : null;
  if (button) {
    button.type = 'button';
    button.className = 'flight-faster';
    button.setAttribute('aria-label', 'Hraðar!');
    // the word until the wing icon (game-icons.net, CC BY 3.0, credited) comes with the owner's yes
    button.textContent = 'Hraðar!';
    button.hidden = true;
    button.addEventListener('click', press);
    doc.body.append(button);
  }
  const hint = doc ? doc.createElement('div') : null;
  if (hint) {
    hint.className = 'flight-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.hidden = true;
    doc.body.append(hint);
  }
  // what follows the shot: steering and the button only in chase shots, from the frame of the cut on (the beats cut after the frame's
  // update, flight-camera.js onCut)
  function follow() {
    if (!mayGuide(flightTime())) letGo();
    if (!button) return;
    const pressing = s.time < pressedUntil;
    button.hidden = !pressing && !(on.faster && camera.current === 'chase' && flier.canBurst());
    if (!pressing) button.classList.remove('is-pressed');
  }
  const offCut = camera.onCut?.(follow) ?? (() => {});
  let hintFrom = null; // when the hint first showed: in the first chase shot she can be steered in
  let hintDone = false;
  function hintFrame(t) {
    if (!hint) return;
    const may = mayGuide(t) && t >= BEATS.B + 1; // her lanes start a second into B
    if (!hintDone && may && hintFrom === null) hintFrom = t;
    if (hintFrom !== null && (!may || steered || t - hintFrom >= PLAY.hint)) hintDone = true;
    hint.hidden = hintDone || hintFrom === null;
  }

  return {
    calls, answers, bursts, big, speedLines, guided, tapped,
    get button() { return button; },
    enable(kind, value) {
      if (!(kind in on)) throw new Error(`Unknown flight play "${kind}" (use steer, call or faster)`);
      on[kind] = Boolean(value);
      // the calls of C end with it: any group still not called is called now, so every group is called once
      if (kind === 'call' && !value) for (const g of groups) if (!g.called) callGroup(g, 'auto');
    },
    bigCall,
    update(t) {
      const before = last;
      const dt = last === null ? 0 : Math.max(0, t - last);
      last = t;
      follow();
      skimFrame(t);
      hintFrame(t);
      guideFrame(t);
      groupsFrame(t);
      cryFrame(before, t);
      lifeFrame(before, t);
      bankFrame(t);
      if (t >= boostUntil && boostUntil > -Infinity) {
        camera.boost(false);
        speedLines.show(false);
        boostUntil = -Infinity;
      }
      speedLines.update(dt);
    },
    stop() {
      letGo();
      offCut();
      offDrag();
      offLand();
      for (const off of offTaps) off();
      for (const g of groups) untarget(g);
      camera.boost(false);
      button?.remove();
      hint?.remove();
      speedLines.dispose();
    },
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
