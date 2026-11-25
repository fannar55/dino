// The five friends come up out of the sea of cloud (spec 3, scene 1: "hver þeirra þekkist áður en hann sést allur"), each in her
// 15 s (hatid-route.js ARRIVALS), each known by her sign before her body is on the top:
//
//   flugedla   a speck far out over the sea, a lap round the top (kafli4-flugedla.js flyPath), down onto her stand; the flyers with her
//   kambedla   the cloud over her way lights lilac (top.sea.light) and her plates glow in it at the rim's foot
//              (engine/plate-glow.js), SIGN.glow s; then she steps out
//   uggedla    her sail alone cuts along the rim's cloud like a boat, SAIL.metres, then she climbs out; the frogs, turtles and
//              lizards hop off her back
//   thorsedla  her head rises out of the sea (her liftUp), she looks about from the rim, her head some 9 m over the sea, and then
//              the rest of her comes
//   sloedla    one clear note of her horn from inside the cloud (chapter 5's true horn, engine/audio/choir-sounds.js, and her 'call'
//              clip), then she walks up with the grazers behind her
//
//   yield* arrive(s, c, entry)   entry: an ARRIVALS entry; done when she stands on her farewell stand facing the sun
//   seatedWave(egill)            his wave as he sits (his sit clip with his wave's right arm): the clip's name, made once
//
// The scene's tools are c.cut(name), c.say(speaker, id) (a generator), c.sound(name, detail), c.log(entry) and c.guests (hatid.js
// setUp). Each friend comes up from under the sea by her way (top.wayUp: under it, the rim, inside it): her model sunk a little
// further where her sign must come first (an overlay on her model: the root walks the ground, so nothing of her jumps), and her walk
// one curve from under the cloud to her stand, so she never stops and starts again on the way.
import * as THREE from 'three';
import { ARRIVALS, arrivalOf } from './hatid-route.js';
import { holdHer, flyPath } from './kafli4-flugedla.js';
import { BODY_HEIGHT } from './kafli4-route.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import { createChoirSounds, loadChoirRecordings } from '../engine/audio/choir-sounds.js';
import { FJALL } from '../world/fjall/ground.js';

const deg = Math.PI / 180;
const smooth = k => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
const headingTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / deg;
const SUN_HEADING = -145; // hatid-route.js BEARING.sun

/** Each sign's seconds and what it takes (first values; the owner judges them in the video). */
export const SIGN = {
  speck: { out: 210, up: 26, lap: 47, seconds: 15.6 }, // m out, m up, the lap's radius, the flight's seconds (speck to stand)
  // her plates lit in the cloud before she steps out, the cloud lit lilac round them (top.sea.light: `radius` m, eased in and out over
  // `ease` s), `out` m past the rim (clear of the top's shoulder from her lens), her model lifted `lift` m over the ground there so her
  // plates stand in the rim's puffs, not under them
  glow: { seconds: 3, ease: 0.8, radius: 11, colour: '#c9a2e6', lift: 3.5, out: 4 },
  sail: { metres: 20, seconds: 4.2, out: 1, lift: 0 }, // along the rim's cloud, `out` m past the rim (ground 8 m down), her model lifted
  head: { seconds: 4.6, rate: 1.75, look: 2.4 }, // her liftUp at `rate` (8 s at 1), her look about from the rim
  horn: { seconds: 2.6, after: 0.6, lift: 0 }, // the note, the wait after it before she walks, her model lifted (m) at the rim
};
// Her line this far into her 15 s (once she is on the top), and her walk's pace (m/s) from the cloud to her stand.
const LINE = { flugedla: 12.5, kambedla: 9.6, uggedla: 9.8, thorsedla: 11.4, sloedla: 7.4 };
const PACE = { kambedla: 4, uggedla: 4.2, thorsedla: 3.9, sloedla: 3.8 };
const UNDER = 4; // m: how far a hidden model is sunk under its ground while her sign shows
const CUT_LATE = { thorsedla: 2 }; // s into her coming before her shot (her head over the cloud some 1 s after it, not 3)
// Her second shot (hatid-route.js home_<friend>): when her root is OVER m inside the rim, or HOME_AT s into her coming
const OVER = 1;
const HOME_AT = { flugedla: 11 };

/** The way she comes: a point `out` m past the rim on her way (negative: inside it), on the ground there. */
function wayPoint(c, friend, out, aside = 0) {
  const [, rim] = arrivalOf(c.top, friend).way;
  const r = Math.hypot(...rim);
  const a = Math.atan2(rim[1], rim[0]) + aside / Math.max(1, r + out);
  return [Math.cos(a) * (r + out), Math.sin(a) * (r + out)];
}

/** Her model sunk under (or lifted over) her root, eased on the game clock; done() gives her model back. */
function sinker(actor) {
  const state = { from: 0, to: 0, t: 0, seconds: 0, now: 0 };
  actor.setOverlay(dt => {
    state.t = Math.min(state.seconds, state.t + (dt || 0));
    const k = state.seconds > 0 ? smooth(state.t / state.seconds) : 1;
    state.now = state.from + (state.to - state.from) * k;
    actor.model.position.y = -state.now;
  });
  return {
    set(m) { Object.assign(state, { from: m, to: m, t: 0, seconds: 0, now: m }); actor.model.position.y = -m; },
    ease(m, seconds) { Object.assign(state, { from: state.now, to: m, t: 0, seconds }); },
    get now() { return state.now; },
    done() { actor.setOverlay(null); },
  };
}

/**
 * Flugeðla's way from the speck to her stand ([x, y, z] points for flyPath): in from far out off her way (bearing about -35) on a
 * straight line that meets the lap's circle along it, round the top the way the clock goes (her right wing in, so she banks one way
 * the whole time: a turn the other way at her speed would flip her bank in a frame), off it over the north rim in a closing spiral
 * the same way round, down onto her stand (bearing 12, 24 m out). Points about SPACING m apart all along: flyPath's curve gives each
 * stretch between two points the same share of its parameter, so uneven stretches would change her speed in a frame where they meet.
 */
const LAP = { entry: -110, exit: -288, high: 17, low: 11, spiral: 60, spacing: 12, wide: 0.6 }; // wide: the arc in's radius, of `out`
export function speckWay(top, stand, { out, up, lap }) {
  const at = (bearing, r, y) => [Math.cos(bearing * deg) * r, y, Math.sin(bearing * deg) * r];
  const standR = Math.hypot(...stand);
  // the way in: a wide arc turning the same way, met by the lap along it (its middle beyond the top's, on the line through where
  // they meet), so her turn only tightens and her bank keeps its side
  const wide = out * LAP.wide, sweep = (out * 0.8) / wide / deg;
  const centre = at(LAP.entry, lap - wide, 0);
  const sections = [
    // the arc in, falling from `up` over the sea to the lap's height
    { length: sweep * deg * wide, at: k => {
      const b = (LAP.entry + sweep * (1 - k)) * deg;
      return [centre[0] + Math.cos(b) * wide, FJALL.top.sea + up + (LAP.high - FJALL.top.sea - up) * smooth(k), centre[2] + Math.sin(b) * wide];
    } },
    // the lap
    { length: (Math.abs(LAP.exit - LAP.entry) * deg) * lap, at: k => at(LAP.entry + (LAP.exit - LAP.entry) * k, lap, LAP.high + (LAP.low - LAP.high) * k) },
    // the spiral down
    { length: LAP.spiral * deg * (lap + standR) / 2, at: k => {
      const [x, , z] = at(LAP.exit + 360 - LAP.spiral * k, lap + (standR - lap) * smooth(k), 0); // eased: no corner off the lap
      return [x, LAP.low + (top.heightAt(x, z) - LAP.low) * smooth(k), z];
    } },
  ];
  const points = [];
  for (const [i, section] of sections.entries()) {
    const n = Math.max(2, Math.round(section.length / LAP.spacing));
    for (let j = i === 0 ? 0 : 1; j <= n; j++) points.push(section.at(j / n));
  }
  points[points.length - 1] = [stand[0], top.heightAt(...stand), stand[1]];
  return points;
}

// Her hips over her root as kafli4-flugedla.js has them (HIPS there: 0.06 m on, BODY_HEIGHT up), and how soon her turn follows the
// flight's (s): flyPath banks her from the way's turn rate at her speed, and over a long fast lap that rate wavers a little each frame,
// so her root, hung 2.6 m under her hips, would swing with it.
const HIPS = new THREE.Vector3(0.06, BODY_HEIGHT, 0);
const STEADY = 0.12;

/**
 * A flight (`fly(shadow)`: flyPath on a held root of its own) with her turn eased after it: her body goes exactly where the flight
 * puts it, and her root turns about it toward the flight's turn over STEADY s, so a wavering bank never jerks her. Ends with the flight.
 */
export function* steadyFlight(s, held, fly) {
  const shadow = {
    root: { position: held.root.position.clone(), quaternion: held.root.quaternion.clone() },
    get heading() { return held.heading; },
  };
  const run = fly(shadow);
  const body = new THREE.Vector3(), hips = new THREE.Vector3();
  let was = s.time, done = false;
  for (;;) {
    if (!done) done = run.next().done;
    const dt = Math.max(0, s.time - was);
    was = s.time;
    body.copy(HIPS).applyQuaternion(shadow.root.quaternion).add(shadow.root.position);
    held.root.quaternion.slerp(shadow.root.quaternion, 1 - Math.exp(-dt / STEADY));
    // once the flight is over she is still, and her turn settles where it ends
    if (done && held.root.quaternion.angleTo(shadow.root.quaternion) < 0.003) held.root.quaternion.copy(shadow.root.quaternion);
    held.root.position.copy(body).sub(hips.copy(HIPS).applyQuaternion(held.root.quaternion));
    if (done && held.root.quaternion.equals(shadow.root.quaternion)) return;
    yield;
  }
}

/** She walks from where she is through `points` ([x, z]) to her stand at `pace` m/s, and turns to the sun there. */
function* walkHome(s, c, friend, points, pace) {
  const actor = c[friend].raw;
  const to = c.stands.farewell[friend].at;
  yield actor.walkTo([...points, to], { speed: pace, turnRate: 55 });
  yield actor.turnTo(SUN_HEADING, { rate: 45 });
}

/** One of the five comes up (an ARRIVALS entry): her sign, her coming, her line, her walk to her stand. */
export function* arrive(s, c, { friend, line }) {
  c.log({ type: 'arrive', friend });
  // her shot, as she comes or CUT_LATE s into her coming (the shot before holds on): Þórseðla's head is under the cloud her first 3 s
  if (CUT_LATE[friend]) s.after(CUT_LATE[friend], () => { c.cut(`arrive_${friend}`); return null; });
  else c.cut(`arrive_${friend}`);
  // and her second shot, from the top, the moment she is over the rim (Flugeðla: HOME_AT s in, as she comes down off her lap): she
  // comes to her stand and says her line in it, and her sign's shot is not seen again once she has left it
  const start = s.time;
  const actor = c[friend].raw;
  s.after(0, function* home() {
    if (HOME_AT[friend] != null) yield s.until(() => s.time - start >= HOME_AT[friend]);
    else {
      yield s.until(() => {
        const { x, z } = actor.root.position;
        return s.time - start > Math.max(1, CUT_LATE[friend] ?? 0) && actor.root.visible && Math.hypot(x, z) <= Math.hypot(...c.top.edge(Math.atan2(z, x))) - OVER;
      });
    }
    c.cut(`home_${friend}`);
  });
  s.after(LINE[friend], function* herLine() { yield* c.say(friend, line); });
  yield* COMING[friend](s, c, start);
}

const COMING = {
  // A speck far out over the sea, a lap round the top, and down onto her stand; the flyers glide in with her.
  *flugedla(s, c) {
    const her = c.flugedla.raw;
    const { out, up, lap, seconds } = SIGN.speck;
    const stand = c.stands.farewell.flugedla.at;
    const points = speckWay(c.top, stand, SIGN.speck);
    const held = holdHer(c);
    held.place(new THREE.Vector3(...points[0]), headingTo([points[0][0], points[0][2]], [points[1][0], points[1][2]]));
    her.root.visible = true;
    c.log({ type: 'sign', friend: 'flugedla', sign: 'speck' });
    c.guests?.come('flyers', seconds - 1.2);
    yield* steadyFlight(s, held, shadow => flyPath(s, c, shadow, { points, seconds, clips: [[0, 'fly', 0.4], [0.3, 'glide', 0.8], [0.62, 'fly', 0.6], [0.86, 'land', 0.5]], face: SUN_HEADING, turn: 0.12, landing: null }));
    // let go, upright, facing where flyPath turned her (her root's Euler angles may have flipped round in the flight)
    const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(held.root.quaternion);
    her.control(null);
    her.root.rotation.set(0, -Math.atan2(ahead.z, ahead.x), 0);
    her.root.position.y = c.top.heightAt(her.root.position.x, her.root.position.z);
    her.play('idle', { fade: 0.6 });
  },

  // The cloud over her lights lilac and her plates glow in it past the rim's foot for SIGN.glow s (the rest of her in it); then she
  // steps out.
  *kambedla(s, c) {
    const her = c.kambedla.raw;
    const { seconds, ease, radius, colour, lift, out } = SIGN.glow;
    const from = wayPoint(c, 'kambedla', out); // past the rim's foot: her plates up in the cloud, the rest of her in it
    her.place(from[0], from[1], headingTo(from, wayPoint(c, 'kambedla', out, -10))); // along the rim (facing up it, half of her was in the hill)
    const sunk = sinker(her);
    sunk.set(-lift);
    her.root.visible = true;
    c.plates ??= c.world.effects.add(addPlateGlow(her, { colour: '#ab85c1', dull: 0 }));
    c.plates.setAll(1, { duration: 0.6 });
    c.log({ type: 'sign', friend: 'kambedla', sign: 'glow' });
    // the cloud over her lights lilac round her plates, eased in and out over the sign's seconds, then is as it was (no light)
    const light = v => c.top.sea?.light?.(v, { at: from, radius, colour });
    const start = s.time;
    s.after(0, function* cloudLight() {
      for (;;) {
        const t = s.time - start;
        if (t >= seconds) { light(0); return; }
        light(smooth(t / ease) * (1 - smooth((t - seconds + ease) / ease)));
        yield;
      }
    });
    yield s.wait(seconds);
    // she steps out: up the rim, her model up from under the cloud as she climbs
    sunk.ease(0, 2.6);
    const inside = wayPoint(c, 'kambedla', -8);
    yield* walkHome(s, c, 'kambedla', [wayPoint(c, 'kambedla', 0), inside], PACE.kambedla);
    sunk.done();
  },

  // Her sail alone cuts along the rim's cloud like a boat; then she turns in and climbs out, and the small ones hop off her back.
  *uggedla(s, c) {
    const her = c.uggedla.raw;
    const { metres, seconds, out, lift } = SIGN.sail;
    const from = wayPoint(c, 'uggedla', out, metres);
    const to = wayPoint(c, 'uggedla', out, 2);
    her.place(from[0], from[1], headingTo(from, to));
    const sunk = sinker(her);
    sunk.set(-lift);
    her.root.visible = true;
    c.log({ type: 'sign', friend: 'uggedla', sign: 'sail' });
    // along the rim, wading, only her sail over the cloud
    const wade = her.walkTo([to], { speed: metres / seconds, clip: 'wade', turnRate: 40 });
    yield s.wait(seconds - 0.6);
    // and in: up the rim, the small ones on her back hop off as she comes over it
    sunk.ease(0, 3);
    const rim = wayPoint(c, 'uggedla', 0), inside = wayPoint(c, 'uggedla', -8);
    void wade; // the walk home takes over from the wade, on the move
    const home = walkHome(s, c, 'uggedla', [rim, inside], PACE.uggedla);
    c.guestBack = () => { const p = her.root.position; return [[p.x, p.y + 3.2, p.z]]; };
    s.after(3.2, () => { c.guests?.come('hoppers', 5); return null; });
    yield* home;
    sunk.done();
  },

  // Her head rises out of the sea, high over everyone, she looks about from the rim, and then the rest of her comes.
  *thorsedla(s, c) {
    const her = c.thorsedla.raw;
    const { seconds, rate, look } = SIGN.head;
    const from = wayPoint(c, 'thorsedla', 18);
    const rim = wayPoint(c, 'thorsedla', 0.3);
    const heading = headingTo(from, rim);
    her.place(from[0], from[1], heading);
    const sunk = sinker(her);
    sunk.set(UNDER * 0.75);
    her.root.visible = true;
    her.play('liftUp', { fade: 0, timeScale: rate });
    sunk.ease(0, seconds);
    c.log({ type: 'sign', friend: 'thorsedla', sign: 'head' });
    // under the cloud she comes on to the rim as her head rises (her feet unseen: her root is held, her lift plays on), so at the
    // rim her head is at its highest over the sea, the rest of her still in the cloud
    let t = 0;
    her.control(dt => {
      t += dt || 0;
      const k = smooth(t / seconds);
      const x = from[0] + (rim[0] - from[0]) * k, z = from[1] + (rim[1] - from[1]) * k;
      her.root.position.set(x, c.top.heightAt(x, z), z);
    });
    yield s.wait(seconds);
    her.control(null);
    // she looks about from the rim
    const [x, z] = rim;
    const side = a => [x + Math.cos(a) * 30, 8, z + Math.sin(a) * 30];
    const facing = heading * deg;
    her.lookAt(side(facing - 0.7), { weight: 0.9, maxAngle: 60, maxPitch: 20 });
    yield s.wait(look / 2);
    her.lookAt(side(facing + 0.7), { weight: 0.9, maxAngle: 60, maxPitch: 20 });
    yield s.wait(look / 2);
    her.lookAt(null);
    sunk.done();
    yield* walkHome(s, c, 'thorsedla', [wayPoint(c, 'thorsedla', -8)], PACE.thorsedla);
  },

  // One clear note of her horn from inside the cloud; then she walks up, the grazers behind her.
  *sloedla(s, c) {
    const her = c.sloedla.raw;
    const { seconds, after } = SIGN.horn;
    const from = wayPoint(c, 'sloedla', 0); // at the rim, her head just over the cloud
    her.place(from[0], from[1], headingTo(from, wayPoint(c, 'sloedla', 0)));
    const sunk = sinker(her);
    sunk.set(-SIGN.horn.lift); // her head and crest high over the rim's puffs as the horn sounds (her body still in them)
    her.root.visible = true;
    if (her.clips.has('call')) her.play('call', { fade: 0.3 });
    c.log({ type: 'sign', friend: 'sloedla', sign: 'horn' });
    c.horn(seconds);
    yield s.wait(seconds + after);
    sunk.ease(0, 3);
    c.guests?.come('grazers', 9);
    yield* walkHome(s, c, 'sloedla', [wayPoint(c, 'sloedla', 0), wayPoint(c, 'sloedla', -8)], PACE.sloedla);
    sunk.done();
  },
};

/** Slóeðla's one clear note (chapter 5's true horn at the grazers' tone, held, no wobble), from her side; made where the page has sound. */
export function hornOf(world) {
  const context = world.sound?.context ?? null;
  let sounds = null;
  return seconds => {
    if (!context) return false;
    sounds ??= createChoirSounds({ context, output: world.sound?.output ?? null, recordings: loadChoirRecordings(context) });
    return sounds.horn('grazers', { seconds, level: 0.2 });
  };
}

// Egill's wave as he sits: his sit clip, with his wave's right arm (the wave moves only his right lower arm and hand, from a raised
// upper arm: wave.glb measured 2026-11-25), so the seat keeps him and his legs stay astride.
const ARM = /^Right(Shoulder|UpperArm|LowerArm|Hand)/;
export function seatedWave(egill) {
  if (egill.clips.has('sitWave')) return 'sitWave';
  const sit = egill.clips.get('sit'), wave = egill.clips.get('wave');
  if (!sit || !wave) return null;
  const tracks = [...sit.tracks.filter(t => !ARM.test(t.name)), ...wave.tracks.filter(t => ARM.test(t.name))];
  const clip = new THREE.AnimationClip('sitWave', wave.duration, tracks.map(t => t.clone()));
  egill.clips.set('sitWave', clip);
  return 'sitWave';
}
