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
import * as THREE from 'three';
import { BEATS } from './kafli4-route.js';
import { FLIGHT } from '../engine/flier.js';
import { createSpeedLines } from '../world/props/speed-lines.js';

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
  // seconds after the big call: answers from everywhere, [after, sound, pan] (plan Task 16: frogs, birds and lizards, 0.4 to 0.9 aside)
  bigAnswers: [[3, 'frog', -0.7], [3.3, 'lizards', 0.6], [3.6, 'birds', 0.85], [4.3, 'frog', 0.5], [4.6, 'lizards', -0.45], [5, 'birds', -0.9]],
  shoutEvery: 3, // Egill shouts on the first burst and every third after it
};
const CALLS = ['k4_flugedla_call1', 'k4_flugedla_call2', 'k4_flugedla_call3'];
const SHOUTS = ['k4_egill_faster1', 'k4_egill_faster2'];
// Each group's answer among the game's sounds (sfx.js): the turtle's and the small lizards' are the owner's recordings (Task 16).
export const ANSWER = { frogs: 'frog', birds: 'birds', dragonflies: 'dragonfly', turtle: 'turtleCall', lizards: 'lizards' };
const GROUP_RADIUS = 4; // metres: a group's own size where the grey valley has no animals to say it

/**
 * The flight's voices, one at a time: a line asked for while another plays (or waits) waits its turn, so no line is cut or talked over.
 * `say(speaker, id, { ifQuiet, onStart })` returns the line's entry ({ task, started }), or null when `ifQuiet` and a line plays.
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
    say(speaker, id, { ifQuiet = false, onStart = null } = {}) {
      const entry = { speaker, id, onStart, task: null, started: null };
      if (playing() || waiting.length) {
        if (ifQuiet) return null;
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
  let last = null; // the flight's time at the last update

  // ---- Steering --------------------------------------------------------------------------------------------------------------------
  let drag = null; // the dragging finger's travel since it started: { x, y } in px
  let asked = false; // a steer or a skim is asked of her
  let skimming = false;
  let touching = false; // she skims and touches the water
  let nextRing = 0;
  let lastLaugh = -Infinity;
  let steered = false; // he has steered once: the hint goes
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

  // where she skims and touches the water: the splash, Egill's laugh, and a ring in the water every quarter of a second
  function skimFrame(t) {
    const p = flier.pose.position;
    const water = skimming ? route.waterAt(p.x, p.z, 2) : null;
    const now = water !== null && p.y - water <= PLAY.touch;
    if (now && !touching) {
      s.sfx('skim');
      if (t - lastLaugh >= PLAY.laughEvery && c.say('egill', 'k4_egill_laugh', { ifQuiet: true })) lastLaugh = t;
      nextRing = t;
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
  function callGroup(g, how) {
    if (g.called) return;
    g.called = true;
    untarget(g);
    const voiced = c.say('flugedla', CALLS[nextCall % CALLS.length], { ifQuiet: true }) !== null;
    if (voiced) nextCall++;
    calls.push({ id: g.id, how, t: flightTime(), voiced });
    s.after(PLAY.answerAfter, () => {
      const animal = animalOf(g.id);
      if (animal && !animal.answered) animal.answer();
      if (ANSWER[g.kind]) s.sfx(ANSWER[g.kind]);
      answers.push({ id: g.id, t: flightTime() });
    });
  }
  const offTaps = groups.map(g => s.onTap(g.name, () => { if (on.call && g.targeted) callGroup(g, 'tap'); }));
  function groupsFrame() {
    for (const g of groups) {
      if (g.called) continue;
      if (!on.call || flightTime() >= BEATS.D) {
        untarget(g);
        continue;
      }
      const ahead = (g.u - flier.u) * route.length;
      if (ahead <= PLAY.callAhead) callGroup(g, 'auto');
      else if (ahead <= PLAY.targetAhead && !g.targeted) target(g);
    }
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
        for (const [after, name, pan] of PLAY.bigAnswers) s.after(after, () => { s.sfx(name, { pan }); });
      },
    });
  }
  const offLand = s.onTap(null, () => { if (on.call && flightTime() >= BEATS.F) bigCall('tap'); });

  // ---- „Hraðar!“ -------------------------------------------------------------------------------------------------------------------
  const speedLines = createSpeedLines(world, world.camera);
  // drawn once now, as the flight starts in the black, so the first burst is not their first draw (a stall of some 0.1 s: main.js)
  if (!s.seeking) world.warmObjects?.([speedLines.mesh]);
  let shoutDue = true;
  let sinceShout = 0;
  let boostUntil = -Infinity;
  function press() {
    if (!button || button.hidden || !flier.burst()) return;
    const t = flightTime();
    camera.boost(true);
    speedLines.show(true);
    boostUntil = t + FLIGHT.burst.seconds;
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
      c.say('flugedla', 'k4_flugedla_holdon');
      shoutDue = false;
      sinceShout = 0;
    }
    bursts.push({ t, shout });
    if (button) button.hidden = true;
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
    if (button) button.hidden = !(on.faster && camera.current === 'chase' && flier.canBurst());
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
    calls, answers, bursts, big, speedLines,
    get button() { return button; },
    enable(kind, value) {
      if (!(kind in on)) throw new Error(`Unknown flight play "${kind}" (use steer, call or faster)`);
      on[kind] = Boolean(value);
      // the calls of C end with it: any group still not called is called now, so every group is called once
      if (kind === 'call' && !value) for (const g of groups) if (!g.called) callGroup(g, 'auto');
    },
    bigCall,
    update(t) {
      const dt = last === null ? 0 : Math.max(0, t - last);
      last = t;
      follow();
      skimFrame(t);
      hintFrame(t);
      groupsFrame();
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
