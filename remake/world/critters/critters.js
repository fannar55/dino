import * as THREE from 'three';
import { DONE, Handle } from '../../engine/handle.js';
import { seededRandom } from '../../engine/random.js';
import { clamp, smoothstep } from '../forest/random.js';
import { BEETLE_SIZE, BIRD, DRAGONFLY, EARLY_BIRD, KINDS, WINGED, createModel } from './models.js';

// Critters a child can tap: a frog, a snail and a beetle by the path and in the glade, and little birds in the bushes. A tap
// makes one react, with no words (the sound and the journal entry are the chapter's): the frog hops to a spot beside it, and
// hops back at the next tap, the snail draws into its shell and comes out again, the beetle rolls over onto its back, kicks
// its legs and rolls back. Birds fly up and away, and are gone. Each is one mesh of at most 400 triangles (models.js), one draw
// call; the birds are one instanced mesh for all of them, one call too.
//
//   const critters = createCritters(world, {
//     spots: [{ name: 'frog-1', kind: 'frog', position: [x, y, z], heading }],   // kind: 'frog', 'snail' or 'beetle'; heading: degrees, optional
//     birds: [{ name: 'bird-1', position: [x, y, z], heading }],                  // where each sits, and how it faces
//     onReact(name, kind) {},                                                     // optional: a sound for every reaction
//     ripple(point, strength) {},                                                 // optional: a ring on the water where a Fen animal touches it
//     heightAt(x, z) {},                                                          // optional: the ground they hop and crawl on (world.heightAt)
//   });
//
// The Fen's animals (chapter 2) are spots too, each with a life of its own as well as a reaction: the dragonfly (`position` is
// where it hangs in the air) darts off and back, the diving beetle (`position` on the water) swims round and dips, the
// salamander crawls two lengths of itself away and back, the turtle draws its head in, the early bird flies up, round and back to
// where it sat, the fish (`position` on the water, over where it swims) jumps out once, and the water strider (on the water)
// skates off and back. Their finding ids are their kinds: 'dragonfly', 'waterBeetle', 'salamander', 'turtle', 'earlyBird', 'fish',
// 'waterStrider'. The dragonfly's and the early bird's wings are beaten by the birds' wing shader, a material each.
//   for (const t of critters.targets) s.target(t.name, t);        // { name, point, radius }: what a tap aims at
//   s.onTap('frog-1', () => critters.react('frog-1'));            // returns a Handle, done when the reaction is over
//   critters.scare(point, 6);                                     // birds within 6 m of a point spec fly up; returns their names
//
// position is the ground under the critter ([x, y, z] metres): sit them on the path or bare ground, for the grass (16 to 46 cm)
// hides a frog (0.2 m), a snail (0.12) or a beetle (0.14); a bird may sit up in a bush. A tap makes the frog hop 0.6 m along its
// heading (1 s, 1.4 s when it has to turn round) and back, so keep that line clear; the snail takes 3 s over it, the beetle 2.5 s, and
// a bird is out of sight 3.4 s after it goes up. onReact is for a sound that goes with every reaction, whatever caused it (a tap, scare, a
// walking actor): use it or s.onTap for the sound of a tap, not both. Everything runs on the game clock and is a function of it: the
// critters put themselves on world.effects (engine/effects.js, which main.js updates every frame, after the actors) and read
// world.clock.time, so a game paused or seeked pauses and seeks them, and a capture lands on the same frame. update(dt, t) does the
// same by hand, for a world with no effects. A tap while a critter is reacting joins that reaction (react returns its Handle): one
// reaction a tap, never two. Birds also fly up by themselves when any walking actor (world.actors, actor.walking) comes within
// 6 m: no script has to time it. A bird that has flown off is gone for good; its tap target is parked out of reach and a tap on it
// is a finished Handle. `targets` hold live points that follow each critter. dispose() takes the lot out of the scene, and
// cancels the Handles a script may be waiting on.

const SCARE_RADIUS = 6; // metres: how near a walking actor lets a bird sit, and scare()'s default
const rad = THREE.MathUtils.degToRad;
const clamp01 = k => clamp(k, 0, 1);
const smooth = k => smoothstep(0, 1, k);
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const TAU = Math.PI * 2;

// The frog: turn round (from the second hop on), crouch, leap, land. It hops `distance` m along its heading to a second spot
// and, tapped again, back, so it never wanders off.
const HOP = { turn: 0.4, crouch: 0.22, air: 0.5, land: 0.3, height: 0.38, distance: 0.6 };
// The snail: draw in, stay in, come out. Seconds.
const HIDE = { in: 0.45, hold: 1.4, out: 1.15 };
// The beetle: tip over, lie on its back and kick, roll back, settle. Seconds.
const ROLL = { over: 0.5, lie: 1.3, back: 0.55, settle: 0.15, rock: 0.16, kick: 4.5 };
// A bird: it flies up and away from what scared it and is out of sight after `seconds`. It beats its wings `beat` times a second
// (slow enough to see at 30 fps), climbs `climb` m and flies off at `run` m/s, speeding up by `accel`, weaving `sway` m.
const FLIGHT = { seconds: 3.4, climb: 7, run: 2.5, accel: 3.2, sway: 0.5, beat: 5.2, unfold: 0.12, spread: 0.7 };
const BIRD_MIDDLE = 0.055; // m up a perched bird, where a tap on it is aimed
const PARKED = -1000; // y of the tap target of a bird that has flown off: nothing a finger can reach

const easeOutBack = x => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

function validate(world, { spots, birds, onReact, ripple }) {
  if (!Array.isArray(spots)) throw new TypeError('createCritters takes `spots` as a list of { name, kind, position }');
  if (!Array.isArray(birds)) throw new TypeError('createCritters takes `birds` as a list of { name, position }');
  if (world.effects && !world.clock) throw new Error('Critters run on world.effects, so they need world.clock (engine/clock.js) to read the game time from');
  if (onReact !== undefined && typeof onReact !== 'function') throw new TypeError(`onReact is a function (name, kind) that makes the sound of a reaction, not ${typeof onReact}`);
  if (ripple !== undefined && typeof ripple !== 'function') throw new TypeError(`ripple is a function (point, strength) that rings the water, not ${typeof ripple}`);
  const names = new Set();
  const check = (entry, what, kinds) => {
    if (typeof entry?.name !== 'string' || !entry.name) throw new TypeError(`A ${what} needs a name, the one its tap target has ("frog-1")`);
    if (names.has(entry.name)) throw new TypeError(`Two critters are called "${entry.name}": a name is one critter's`);
    names.add(entry.name);
    if (kinds && !kinds.includes(entry.kind)) throw new TypeError(`The kind of "${entry.name}" is ${JSON.stringify(entry.kind)}; a spot is one of ${kinds.join(', ')}`);
    if (!Array.isArray(entry.position) || entry.position.length !== 3 || !entry.position.every(Number.isFinite)) {
      throw new TypeError(`"${entry.name}" stands at a position [x, y, z] in metres, not ${JSON.stringify(entry.position)}`);
    }
    if (entry.heading !== undefined && !Number.isFinite(entry.heading)) {
      throw new TypeError(`"${entry.name}" faces a heading in degrees (0 faces +X, 90 faces +Z), not ${JSON.stringify(entry.heading)}`);
    }
  };
  for (const spot of spots) check(spot, 'spot', KINDS);
  for (const bird of birds) check(bird, 'bird', null);
}

// What a bird is drawn with: the standard material with its wings folded or flapped in the vertex shader, by two attributes: the
// wing tag of each vertex (models.js) and the beat of each bird (aFlight: the wing angle, down positive, and 0 at rest to 1 in
// flight). A wing is rotated about the shoulder line along the body, or, at rest, folded along the flank: a rotation baked in below.
// A winged spot (the Fen's dragonfly and early bird) is drawn the same way with its own shoulder and fold, its beat a uniform of
// its own material (`flight`, kept in material.userData.flight) rather than an attribute of an instance.
const WINGS = {
  bird: BIRD,
  dragonfly: { shoulder: DRAGONFLY.shoulder, fold: { rotation: [0, 0, 0], offset: [0, 0, 0] } }, // a dragonfly never folds its wings
  earlyBird: EARLY_BIRD,
};
function birdMaterial(kind = 'bird', { flight = null } = {}) {
  const { shoulder, fold: folding } = WINGS[kind];
  const e = new THREE.Matrix4().makeRotationZ(folding.rotation[2]).multiply(new THREE.Matrix4().makeRotationX(folding.rotation[0])).elements;
  const fold = `mat3( ${[e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]].map(v => v.toFixed(6)).join(', ')} )`;
  const [sx, sy, sz] = shoulder;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'dragonfly' ? 0.6 : 0.85, metalness: 0, side: THREE.DoubleSide });
  material.name = kind === 'bird' ? 'critter birds' : `critter ${kind}`;
  if (flight) material.userData.flight = flight;
  const beat = flight ? 'uniform vec2 uFlight; // x: the angle of the wings (down positive), y: 0 at rest, 1 in flight\n#define aFlight uFlight'
    : 'attribute vec2 aFlight; // x: the angle of the wings (down positive), y: 0 at rest, 1 in flight';
  material.onBeforeCompile = shader => {
    const anchors = ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>'];
    if (!anchors.every(anchor => shader.vertexShader.includes(anchor))) {
      console.warn('[critters] three\'s standard shader has changed: the birds will not fold or flap their wings');
      return;
    }
    if (flight) shader.uniforms.uFlight = flight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aWing; // 0 for the body, +1 for the right wing, -1 for the left
${beat}
const mat3 BIRD_FOLD = ${fold};
const vec3 BIRD_SHOULDER = vec3( ${sx.toFixed(4)}, ${sy.toFixed(4)}, ${sz.toFixed(4)} );`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float birdSide = abs( aWing ) > 0.5 ? sign( aWing ) : 0.0;
  float birdCos = cos( aFlight.x );
  float birdSin = sin( aFlight.x );
  if ( birdSide != 0.0 ) {
    vec3 n = objectNormal;
    n.z *= birdSide;
    vec3 flown = vec3( n.x, n.y * birdCos - n.z * birdSin, n.y * birdSin + n.z * birdCos );
    n = normalize( mix( BIRD_FOLD * n, flown, aFlight.y ) );
    n.z *= birdSide;
    objectNormal = n;
  }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  if ( birdSide != 0.0 ) {
    vec3 pivot = vec3( BIRD_SHOULDER.x, BIRD_SHOULDER.y, BIRD_SHOULDER.z * birdSide );
    vec3 rel = position - pivot;
    rel.z *= birdSide;
    vec3 flown = vec3( rel.x, rel.y * birdCos - rel.z * birdSin, rel.y * birdSin + rel.z * birdCos );
    vec3 folded = BIRD_FOLD * rel + vec3( ${folding.offset.map(v => v.toFixed(4)).join(', ')} );
    vec3 w = mix( folded, flown, aFlight.y );
    w.z *= birdSide;
    transformed = pivot + w;
  }`);
  };
  material.customProgramCacheKey = () => (kind === 'bird' ? 'critter-birds' : `critter-wings-${kind}`);
  return material;
}

// ---- the Fen's animals: how each lives, and how a tap makes it react ----------------------------------------------------------
// Each lives a little by itself (its idle), as a pure function of the game time, and a tap makes it react, a pure function of
// the seconds since the tap laid over its idle, so it starts and ends where its idle has it and never pops. They move their mesh
// in their own frame (x the way they face, z to their right; `root` stays where they were put).
const easeOut = k => 1 - (1 - clamp01(k)) ** 2;
const setMorph = (mesh, name, value) => { mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]] = value; };
const flap = (c, angle, open) => c.flight?.value.set(angle, open);
/** The early bird's flight: a loop out to its right and back, landing from behind as it took off, `s` from 0 to 1. */
const LOOP = { forward: 1.0, right: 0.8, high: 2.1 };
function loopAt(s, out) {
  const a = Math.PI * 2 * s;
  return out.set(LOOP.forward * Math.sin(a), LOOP.high * Math.sin(Math.PI * s) ** 0.7, LOOP.right * (1 - Math.cos(a)));
}
const loopA = new THREE.Vector3();
const loopB = new THREE.Vector3();

const FEN_LIFE = {
  dragonfly: {
    // it hangs in the air, drifting a little, its wings a blur; a tap sends it darting off and it comes back
    idle(c, t) {
      const p = c.phase;
      c.mesh.position.set(0.07 * Math.sin(t * 0.83 + p), 0.035 * Math.sin(t * 1.9 + 2 * p), 0.06 * Math.sin(t * 0.61 + 3 * p));
      c.mesh.rotation.set(0, 0.35 * Math.sin(t * 0.47 + p), 0);
      setMorph(c.mesh, 'hover', 1);
      flap(c, 0.12 + 0.6 * Math.sin(TAU * 11 * t + p), 1);
    },
    seconds: 2.0,
    react(c, tau, t) {
      FEN_LIFE.dragonfly.idle(c, t);
      const k = tau < 0.28 ? easeOut(tau / 0.28) : tau < 1.45 ? 1 : 1 - smooth((tau - 1.45) / 0.5);
      c.mesh.position.addScaledVector(c.dart, k);
      c.mesh.rotation.y += 0.6 * Math.sin(Math.PI * clamp01(tau / 1.9));
    },
  },
  waterBeetle: {
    // it swims round and round at the top of the water, rowing; a tap: a quick circle more, dipping under, and up again
    idle(c, t, extra = 0, dip = 0) {
      const a = (TAU / 6.5) * t + c.phase + extra;
      c.mesh.position.set(0.085 * Math.cos(a), -0.012 - dip, 0.085 * Math.sin(a));
      c.mesh.rotation.set(0, -(a + Math.PI / 2), 0);
      setMorph(c.mesh, 'paddle', 0.5 + 0.5 * Math.sin(TAU * (dip > 0 ? 4 : 2.2) * t));
    },
    seconds: 1.3,
    react(c, tau, t) {
      const u = clamp01(tau / 1.3);
      FEN_LIFE.waterBeetle.idle(c, t, TAU * smooth(u), 0.012 * Math.sin(Math.PI * u));
      if (tau >= 0.6 && !c.reaction.rang) { c.reaction.rang = true; c.ripple(0.25); }
    },
    start(c) { c.ripple(0.4); },
  },
  salamander: {
    // it breathes, turns its head and curls its tail; a tap: it crawls two lengths of itself away, turns round, comes back
    idle(c, t, rest = 1) {
      setMorph(c.mesh, 'curl', rest * 0.45 * (0.5 + 0.5 * Math.sin((TAU * t) / 7 + c.phase)));
      setMorph(c.mesh, 'walkA', 0);
      setMorph(c.mesh, 'walkB', 0);
      c.mesh.scale.set(1, 1 + 0.035 * Math.sin(TAU * 0.8 * t), 1);
    },
    seconds: 4.4,
    react(c, tau, t) {
      const away = 0.48; // two lengths of its body
      const rest = 1 - smooth(tau / 0.3) * smooth((4.4 - tau) / 0.3);
      FEN_LIFE.salamander.idle(c, t, rest);
      let x, turn, walking;
      if (tau < 1.6) { x = away * smooth(tau / 1.6); turn = 0; walking = 1; }
      else if (tau < 2.2) { x = away; turn = Math.PI * smooth((tau - 1.6) / 0.6); walking = 0.5; }
      else if (tau < 3.8) { x = away * (1 - smooth((tau - 2.2) / 1.6)); turn = Math.PI; walking = 1; }
      else { x = 0; turn = Math.PI + Math.PI * smooth((tau - 3.8) / 0.6); walking = 0.5; }
      const step = Math.sin(TAU * 3 * tau);
      setMorph(c.mesh, 'walkA', walking * Math.max(0, step));
      setMorph(c.mesh, 'walkB', walking * Math.max(0, -step));
      c.mesh.position.set(x, 0, 0);
      c.mesh.rotation.set(0, -turn, 0);
      c.followGround = true;
    },
  },
  turtle: {
    // it looks about, slowly; a tap: it draws its head and legs into its shell, waits, and puts them out again
    idle(c, t, hidden = 0) {
      const look = Math.max(0, Math.sin((TAU * t) / 9 + c.phase)) ** 2;
      setMorph(c.mesh, 'look', look * (1 - hidden));
      setMorph(c.mesh, 'hide', hidden);
      c.mesh.scale.set(1, 1 + 0.012 * Math.sin((TAU * t) / 3.2), 1);
    },
    seconds: 2.6,
    react(c, tau, t) {
      const hide = tau < 0.3 ? smooth(tau / 0.3) : tau < 1.7 ? 1 : 1 - smooth((tau - 1.7) / 0.9);
      FEN_LIFE.turtle.idle(c, t, hide);
    },
  },
  earlyBird: {
    // it sits, looking about, its wings folded; a tap: it flies up, round to its right and back, and lands where it sat
    idle(c, t) {
      setMorph(c.mesh, 'look', 0.5 + 0.5 * Math.sin((TAU * t) / 5.5 + c.phase));
      c.mesh.position.set(0, 0.004 * Math.sin(TAU * 0.9 * t), 0);
      c.mesh.rotation.set(0, 0, 0);
      flap(c, 0, 0);
    },
    seconds: 4.6,
    react(c, tau, t) {
      FEN_LIFE.earlyBird.idle(c, t);
      const open = smooth(tau / 0.25) * (1 - smooth((tau - 4.3) / 0.3));
      const s = smooth((tau - 0.25) / 4.05);
      loopAt(s, loopA);
      loopAt(Math.min(1, s + 0.01), loopB);
      const flying = tau > 0.25 && tau < 4.3;
      if (flying) {
        c.mesh.position.copy(loopA);
        const dx = loopB.x - loopA.x, dz = loopB.z - loopA.z, dy = loopB.y - loopA.y;
        if (Math.hypot(dx, dz) > 1e-5) c.mesh.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz)) * 0.6, 'YXZ');
      } else c.mesh.position.y -= 0.02 * Math.sin(Math.PI * clamp01(tau / 0.25)); // a crouch to spring up
      // beating up and round, gliding down the far side, beating again to land
      const beat = s < 0.55 || s > 0.88 ? 0.15 + 0.95 * Math.sin(TAU * 5 * tau + c.phase) : 0.1 + 0.08 * Math.sin(TAU * 1.5 * tau);
      flap(c, beat * open, open);
    },
  },
  fish: {
    // it swims round under the water, and now and then rings the surface over it; a tap: it jumps out once and splashes back
    idle(c, t) {
      const a = (TAU / 9) * t + c.phase;
      c.mesh.position.set(0.22 * Math.cos(a), -0.15, 0.22 * Math.sin(a));
      c.mesh.rotation.set(0, -(a + Math.PI / 2), 0, 'YXZ');
      setMorph(c.mesh, 'flex', 0.5 + 0.5 * Math.sin(TAU * 1.6 * t));
      const tick = Math.floor((t + c.phase * 3) / 10.5);
      if (tick !== c.lastTick) {
        if (c.lastTick !== undefined) c.ripple(0.25);
        c.lastTick = tick;
      }
    },
    seconds: 1.6,
    react(c, tau, t) {
      const r = c.reaction;
      if (!r.from) {
        FEN_LIFE.fish.idle(c, r.start);
        r.from = c.mesh.position.clone();
        r.yaw = c.mesh.rotation.y;
      }
      const ax = Math.cos(-r.yaw), az = Math.sin(-r.yaw);
      let x = r.from.x, y = r.from.y, z = r.from.z, pitch = 0;
      if (tau < 0.25) { y = THREE.MathUtils.lerp(r.from.y, 0, smooth(tau / 0.25)); pitch = 0.9 * smooth(tau / 0.25); }
      else if (tau < 0.95) {
        const u = (tau - 0.25) / 0.7;
        x += ax * 0.5 * u; z += az * 0.5 * u;
        y = 0.42 * 4 * u * (1 - u);
        pitch = THREE.MathUtils.lerp(0.9, -1.1, u);
      } else {
        const u = smooth((tau - 0.95) / 0.65);
        x += ax * 0.5; z += az * 0.5;
        y = THREE.MathUtils.lerp(0, r.from.y, u);
        pitch = -1.1 * (1 - u);
      }
      c.mesh.position.set(x, y, z);
      c.mesh.rotation.set(0, r.yaw, pitch, 'YXZ');
      setMorph(c.mesh, 'flex', 0.5 + 0.5 * Math.sin(TAU * 4 * tau));
      if (tau >= 0.25 && !r.out) { r.out = true; c.ripple(0.8); }
      if (tau >= 0.95 && !r.in) { r.in = true; c.ripple(1.3); }
      if (tau > 1.25) {
        // back into its circle under the water, where its idle is now
        const at = c.mesh.position.clone();
        FEN_LIFE.fish.idle(c, t);
        c.mesh.position.lerp(at, 1 - smooth((tau - 1.25) / 0.35));
      }
    },
  },
  waterStrider: {
    // it skates in little pushes, now here, now there, on the water; a tap: it shoots off across the water and back
    idle(c, t) {
      const beat = 1.3;
      const k = Math.floor((t + c.phase) / beat);
      const into = (t + c.phase) / beat - k;
      const spot = n => [0.1 * Math.sin(n * 2.3 + c.phase), 0.1 * Math.sin(n * 1.7 + 2 * c.phase)];
      const [ax, az] = spot(k - 1), [bx, bz] = spot(k);
      const glide = easeOut(into / 0.45);
      c.mesh.position.set(ax + (bx - ax) * glide, 0, az + (bz - az) * glide);
      c.mesh.rotation.set(0, -Math.atan2(bz - az, bx - ax), 0);
      setMorph(c.mesh, 'row', Math.sin(Math.PI * clamp01(into / 0.3)));
    },
    seconds: 1.4,
    react(c, tau, t) {
      FEN_LIFE.waterStrider.idle(c, t);
      const k = tau < 0.3 ? easeOut(tau / 0.3) : tau < 0.65 ? 1 : 1 - smooth((tau - 0.65) / 0.75);
      c.mesh.position.x += 0.4 * k;
      setMorph(c.mesh, 'row', Math.max(c.mesh.morphTargetInfluences[c.mesh.morphTargetDictionary.row], tau < 0.3 || (tau > 0.65 && tau < 0.95) ? 1 : 0));
    },
    start(c) { c.ripple(0.3); },
  },
};

/**
 * Critters standing at their spots in world.scene and, if the world has effects, on them. Returns
 *   group      the THREE.Group, in world.scene
 *   targets    [{ name, point, radius }] for every spot and bird, in that order: point is a live THREE.Vector3
 *              that follows the critter, radius the metres a tap may be off it
 *   react(name)       the critter reacts as a tap makes it; returns a Handle, done when the reaction is over. A tap during a
 *                     reaction joins it (the same Handle). A bird that has flown off gives DONE
 *   scare(point, radius = 6)   the perched birds within `radius` m of `point` (a point spec) fly up and away; returns their names
 *   update(dt, t)     pose everything for game time t (the registered effect does this every frame)
 *   dispose()
 */
export function createCritters(world, { spots = [], birds = [], onReact, ripple, heightAt: groundAt = null } = {}) {
  validate(world, { spots, birds, onReact, ripple });

  const group = new THREE.Group();
  group.name = 'Critters';
  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  groundMaterial.name = 'critters';
  const geometries = [];
  const materials = []; // the winged spots' own
  let disposed = false;
  let lastTime = 0; // the last time update() was given, for a world with no clock

  const now = () => world.clock?.time ?? lastTime;
  // a sound that goes with a reaction is the chapter's, and one that fails must not stop the critter
  function announce(name, kind) {
    try {
      onReact?.(name, kind);
    } catch (error) {
      console.error(`[critters] onReact failed for ${name}:`, error);
    }
  }
  const heightAt = (x, z) => (groundAt ? groundAt(x, z) : world.heightAt?.(x, z) ?? 0); // a place's own ground, or what is on it (a footprint's mud)
  const ringAt = new THREE.Vector3();
  // a ring where a Fen animal touches the water: under (or over) its middle, on the water its spot stands on
  function rings(c, strength) {
    if (!ripple) return;
    c.root.updateWorldMatrix(true, true);
    c.mesh.getWorldPosition(ringAt);
    ringAt.y = c.root.position.y;
    try {
      ripple(ringAt.clone(), strength);
    } catch (error) {
      console.error(`[critters] ripple failed for ${c.name}:`, error);
    }
  }
  function resolve(spec, out) {
    if (world.resolvePoint) return world.resolvePoint(spec, out);
    if (spec?.isVector3) return out.copy(spec);
    if (Array.isArray(spec)) return out.fromArray(spec);
    throw new Error('A point to scare birds from is a point spec: world.resolvePoint (engine/points.js) knows them');
  }

  // ---- the frog, the snail and the beetle -------------------------------------------------------------------------------
  const ahead = new THREE.Vector3();
  const list = spots.map(spot => {
    const model = createModel(spot.kind);
    geometries.push(model.geometry);
    const flight = WINGED.includes(spot.kind) ? { value: new THREE.Vector2(0, 0) } : null;
    const material = flight ? birdMaterial(spot.kind, { flight }) : groundMaterial;
    if (flight) materials.push(material);
    const mesh = new THREE.Mesh(model.geometry, material);
    mesh.name = spot.kind;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = model.pivot;
    const root = new THREE.Group();
    root.name = `Critter ${spot.name}`;
    root.position.fromArray(spot.position);
    const heading = spot.heading ?? seededRandom(`${spot.name} heading`)() * 360; // degrees: 0 faces +X, 90 faces +Z
    root.rotation.y = -rad(heading);
    root.add(mesh);
    group.add(root);
    const c = { name: spot.name, kind: spot.kind, root, mesh, model, heading, leg: 0, reaction: null, point: new THREE.Vector3(), tap: new THREE.Vector3(...model.tap) };
    c.life = FEN_LIFE[spot.kind] ?? null;
    if (c.life) {
      c.phase = seededRandom(`${spot.name} life`)() * TAU; // no two of a kind live in step, and a name always lives the same way
      c.flight = flight;
      c.dart = new THREE.Vector3(0.5 * Math.cos(c.phase), 0.22, 0.5 * Math.sin(c.phase));
      c.ripple = strength => rings(c, strength);
    }
    if (spot.kind === 'frog') {
      // its home and the spot it hops to: along its heading, the ground at the new spot as it is
      c.home = root.position.clone();
      c.far = c.home.clone().add(ahead.set(Math.cos(rad(heading)), 0, Math.sin(rad(heading))).multiplyScalar(HOP.distance));
      c.far.y = c.home.y + heightAt(c.far.x, c.far.z) - heightAt(c.home.x, c.home.z);
    }
    return c;
  });

  /** The way the critter is when it has no reaction going (a Fen animal: its idle, as it is now). */
  function rest(c) {
    c.mesh.scale.set(1, 1, 1);
    c.mesh.rotation.set(0, 0, 0);
    c.mesh.position.set(0, c.model.pivot, 0);
    for (let i = 0; i < c.mesh.morphTargetInfluences.length; i++) c.mesh.morphTargetInfluences[i] = 0;
    if (c.life) {
      c.life.idle(c, now());
      ground(c);
    }
    if (c.kind === 'frog') {
      c.root.position.copy(c.leg % 2 === 0 ? c.home : c.far);
      c.root.rotation.y = -rad(c.leg === 0 ? c.heading : c.heading + 180 * (c.leg - 1));
    }
    settle(c);
  }

  /** A crawler on the ground stands on it wherever it has got to in its own frame. */
  function ground(c) {
    if (c.kind !== 'salamander') return;
    c.root.updateWorldMatrix(true, true);
    c.mesh.position.y = 0;
    c.mesh.updateWorldMatrix(false, false);
    c.mesh.getWorldPosition(ringAt);
    c.mesh.position.y = heightAt(ringAt.x, ringAt.z) - c.root.position.y;
  }

  /** The tap target follows the middle of the critter, as it stands. */
  function settle(c) {
    c.root.updateWorldMatrix(true, true);
    c.point.copy(c.tap).applyMatrix4(c.mesh.matrixWorld);
  }

  const durations = {
    frog: c => (c.leg === 0 ? 0 : HOP.turn) + HOP.crouch + HOP.air + HOP.land,
    snail: () => HIDE.in + HIDE.hold + HIDE.out,
    beetle: () => ROLL.over + ROLL.lie + ROLL.back + ROLL.settle,
    ...Object.fromEntries(Object.entries(FEN_LIFE).map(([kind, life]) => [kind, () => life.seconds])),
  };

  // Each pose is a pure function of the seconds since the tap.
  const poses = {
    frog(c, tau) {
      const turning = c.leg === 0 ? 0 : HOP.turn;
      const from = c.leg % 2 === 0 ? c.home : c.far;
      const to = c.leg % 2 === 0 ? c.far : c.home;
      const facing = c.leg === 0 ? c.heading : c.heading + 180 * (c.leg - 1);
      const mesh = c.mesh;
      c.root.rotation.y = -rad(facing + (turning > 0 ? 180 * smooth(tau / turning) : 0));
      const t = tau - turning;
      let squash = 0; // 0 sitting, 1 crouched low
      let u = 0; // how far through the leap
      if (t < HOP.crouch) squash = smooth(t / HOP.crouch);
      else if (t < HOP.crouch + HOP.air) u = (t - HOP.crouch) / HOP.air;
      else if (t < HOP.crouch + HOP.air + HOP.land) { u = 1; squash = 1 - smooth((t - HOP.crouch - HOP.air) / HOP.land); }
      else u = 1;
      const flying = u > 0 && u < 1;
      const lift = flying ? HOP.height * 4 * u * (1 - u) : 0;
      c.root.position.lerpVectors(from, to, t < HOP.crouch ? 0 : u);
      mesh.position.y = c.model.pivot + lift;
      // stretched in the air, flat when it crouches and when it lands, and tipped up as it goes and down as it comes
      const stretch = flying ? Math.sin(Math.PI * u) : 0;
      mesh.scale.set(1 + 0.1 * squash - 0.06 * stretch, 1 - 0.22 * squash + 0.12 * stretch, 1 + 0.1 * squash - 0.06 * stretch);
      mesh.rotation.z = flying ? 1.8 * (0.5 - u) * Math.sin(Math.PI * u) : 0;
      mesh.morphTargetInfluences[mesh.morphTargetDictionary.leap] = flying ? Math.min(1, 4 * u * (1 - u) * 1.3) : 0;
    },
    snail(c, tau) {
      const hide = tau < HIDE.in ? smooth(tau / HIDE.in) : tau < HIDE.in + HIDE.hold ? 1 : 1 - smooth((tau - HIDE.in - HIDE.hold) / HIDE.out);
      c.mesh.morphTargetInfluences[c.mesh.morphTargetDictionary.hide] = hide;
      c.mesh.rotation.z = -0.07 * hide; // the shell dips forward as it ducks in
    },
    beetle(c, tau) {
      const mesh = c.mesh;
      const lying = tau - ROLL.over;
      let roll;
      let kick = 0;
      if (tau < ROLL.over) roll = Math.PI * easeOutBack(tau / ROLL.over);
      else if (lying < ROLL.lie) {
        const into = smooth(lying / 0.2) * smooth((ROLL.lie - lying) / 0.2);
        roll = Math.PI + ROLL.rock * into * Math.sin(TAU * 1.7 * lying);
        kick = into;
      } else roll = Math.PI + Math.PI * smooth((lying - ROLL.lie) / ROLL.back);
      mesh.rotation.x = roll;
      // kept off the ground as it tips: the half height of the body at this angle, or the lowest foot, with a little hop on its side
      const { height, width, feet } = BEETLE_SIZE;
      const clear = Math.max(Math.hypot(height * Math.cos(roll), width * Math.sin(roll)), feet[0] * Math.cos(roll) + feet[1] * Math.abs(Math.sin(roll)));
      mesh.position.y = Math.max(c.model.pivot, clear);
      const a = 0.5 + 0.5 * Math.sin(TAU * ROLL.kick * lying);
      mesh.morphTargetInfluences[mesh.morphTargetDictionary.kickA] = kick * a;
      mesh.morphTargetInfluences[mesh.morphTargetDictionary.kickB] = kick * (1 - a);
    },
  };

  /** The reaction is over, by running out or by being cut short: the critter is at rest, one hop or roll on. */
  function finish(c) {
    const reaction = c.reaction;
    c.reaction = null;
    if (c.kind === 'frog') c.leg++;
    rest(c);
    reaction?.handle.finish();
  }

  function stepSpot(c, time) {
    if (!c.reaction) {
      if (!c.life) return;
      c.life.idle(c, time);
      ground(c);
      settle(c);
      return;
    }
    const tau = time - c.reaction.start;
    if (tau >= durations[c.kind](c)) { finish(c); return; }
    if (c.life) c.life.react(c, Math.max(0, tau), time);
    else poses[c.kind](c, Math.max(0, tau));
    ground(c);
    settle(c);
  }

  // ---- the birds ----------------------------------------------------------------------------------------------------------
  const flock = birds.length ? createModel('bird') : null;
  let birdMesh = null;
  let birdMat = null;
  const flight = flock ? new THREE.InstancedBufferAttribute(new Float32Array(birds.length * 2), 2) : null;
  const birdList = birds.map((bird, index) => {
    const random = seededRandom(`${bird.name} flight`);
    const b = {
      name: bird.name, kind: 'bird', index, state: 'perched', handle: null, start: 0,
      perch: new THREE.Vector3(...bird.position),
      heading: bird.heading ?? seededRandom(`${bird.name} heading`)() * 360,
      spread: (random() * 2 - 1) * FLIGHT.spread, // radians aside of straight away, so a flock scatters
      climb: FLIGHT.climb * (0.8 + 0.4 * random()),
      phase: random() * TAU,
      away: new THREE.Vector2(1, 0),
      position: new THREE.Vector3(),
      point: new THREE.Vector3(bird.position[0], bird.position[1] + BIRD_MIDDLE, bird.position[2]),
    };
    b.position.copy(b.perch);
    return b;
  });
  if (flock) {
    flock.geometry.setAttribute('aFlight', flight);
    geometries.push(flock.geometry);
    birdMat = birdMaterial();
    birdMesh = new THREE.InstancedMesh(flock.geometry, birdMat, birds.length);
    birdMesh.name = 'Birds';
    birdMesh.frustumCulled = false; // the instances fly out of any bounds taken at the start
    birdMesh.receiveShadow = true;
    group.add(birdMesh);
  }

  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const goal = new THREE.Vector3();
  function place(b, yaw, pitch, roll, size) {
    quaternion.setFromEuler(euler.set(roll, -yaw, pitch));
    birdMesh.setMatrixAt(b.index, matrix.compose(b.position, quaternion, scale.setScalar(size)));
    b.point.set(b.position.x, b.position.y + BIRD_MIDDLE * size, b.position.z);
    if (size === 0) b.point.set(b.perch.x, PARKED, b.perch.z);
  }
  const touched = () => { birdMesh.instanceMatrix.needsUpdate = true; flight.needsUpdate = true; };
  /** A bird sitting where it was put, facing as it does. */
  function sit(b) {
    flight.setXY(b.index, 0, 0);
    b.position.copy(b.perch);
    place(b, rad(b.heading), 0, 0, 1);
  }

  /** A bird in flight at `tau` seconds after it was scared, or out of sight once it has flown far enough. */
  function fly(b, tau) {
    const F = FLIGHT;
    const k = clamp01(tau / F.unfold);
    const run = F.run * tau + 0.5 * F.accel * tau * tau;
    const runSpeed = F.run + F.accel * tau;
    const rise = b.climb * (1 - Math.exp(-tau / 0.9));
    const riseSpeed = (b.climb / 0.9) * Math.exp(-tau / 0.9);
    const weave = F.sway * Math.sin(tau * 3.6 + b.phase) * Math.min(1, tau / 0.8);
    const weaveSpeed = F.sway * 3.6 * Math.cos(tau * 3.6 + b.phase) * Math.min(1, tau / 0.8);
    const hop = 0.07 * Math.sin(Math.PI * clamp01(tau / 0.18)); // a push off the ground
    b.position.set(b.perch.x + b.away.x * run - b.away.y * weave, b.perch.y + rise + hop, b.perch.z + b.away.y * run + b.away.x * weave);
    const vx = b.away.x * runSpeed - b.away.y * weaveSpeed;
    const vz = b.away.y * runSpeed + b.away.x * weaveSpeed;
    const yaw = lerpAngle(rad(b.heading), Math.atan2(vz, vx), smooth(tau / 0.25));
    const pitch = Math.atan2(riseSpeed, Math.hypot(vx, vz)) * smooth(tau / 0.25);
    const bank = -0.45 * Math.max(-1, Math.min(1, weaveSpeed / 2)) * smooth(tau / 0.6);
    flight.setXY(b.index, 0.15 + 0.9 * Math.sin(TAU * F.beat * tau + b.phase), smooth(k));
    place(b, yaw, pitch, bank, 1);
  }

  function gone(b) {
    b.state = 'gone';
    flight.setXY(b.index, 0, 0);
    b.position.copy(b.perch);
    place(b, 0, 0, 0, 0); // out of the picture
    const handle = b.handle;
    b.handle = null;
    handle?.finish();
  }

  function launch(b, from) {
    const t = now();
    b.state = 'flying';
    b.start = t;
    let dx = b.perch.x - from.x;
    let dz = b.perch.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) { dx = Math.cos(rad(b.heading)); dz = Math.sin(rad(b.heading)); } else { dx /= length; dz /= length; }
    b.away.set(Math.cos(b.spread) * dx - Math.sin(b.spread) * dz, Math.sin(b.spread) * dx + Math.cos(b.spread) * dz);
    b.handle = new Handle(`${b.name} flies off`, () => { b.handle = null; gone(b); touched(); }); // cut short: it has flown off
    announce(b.name, 'bird');
    return b.handle;
  }

  function scareFrom(point, radius) {
    const scared = [];
    for (const b of birdList) {
      if (b.state !== 'perched' || b.perch.distanceTo(point) > radius) continue;
      launch(b, point);
      scared.push(b.name);
    }
    return scared;
  }

  function stepBirds(time) {
    if (!birdList.length) return;
    let changed = false;
    for (const b of birdList) {
      if (b.state !== 'flying') continue;
      const tau = Math.max(0, time - b.start);
      if (tau >= FLIGHT.seconds) gone(b);
      else fly(b, tau);
      changed = true;
    }
    if (changed) touched();
  }

  // ---- the critters as a set ----------------------------------------------------------------------------------------------
  const byName = new Map([...list, ...birdList].map(c => [c.name, c]));
  const targets = [...list, ...birdList].map(c => ({ name: c.name, point: c.point, radius: c.model?.radius ?? flock.radius }));
  list.forEach(rest);
  for (const b of birdList) sit(b);

  function react(name) {
    const c = byName.get(name);
    if (!c) throw new Error(`No critter named "${name}" (the critters here are ${[...byName.keys()].join(', ') || 'none'})`);
    if (disposed) return DONE;
    if (c.kind === 'bird') {
      if (c.state === 'gone') return DONE;
      if (c.state === 'flying') return c.handle;
      // away from the camera (the child's finger), else the way it faces
      return launch(c, world.camera?.position ?? goal.set(c.perch.x - Math.cos(rad(c.heading)), c.perch.y, c.perch.z - Math.sin(rad(c.heading))));
    }
    if (c.reaction) return c.reaction.handle; // one reaction a tap: a tap while it goes on is part of it
    const handle = new Handle(`${name} reacts`, () => finish(c));
    c.reaction = { start: now(), handle };
    c.life?.start?.(c);
    announce(name, c.kind);
    return handle;
  }

  function scare(point, radius = SCARE_RADIUS) {
    if (disposed) return [];
    return scareFrom(resolve(point, new THREE.Vector3()), radius);
  }

  /** Poses everything for game time t. dt is not needed: every pose is a function of the time. */
  function update(dt, t = now()) {
    if (disposed) return;
    lastTime = t;
    if (birdList.some(b => b.state === 'perched')) {
      for (const actor of world.actors?.values?.() ?? []) if (actor.walking && actor.root) scareFrom(actor.root.position, SCARE_RADIUS);
    }
    for (const c of list) stepSpot(c, t);
    stepBirds(t);
  }

  function dispose() {
    if (disposed) return;
    for (const c of [...list, ...birdList]) {
      const handle = c.kind === 'bird' ? c.handle : c.reaction?.handle;
      if (handle && !handle.done) { handle.onCancel = null; handle.cancel(); } // a script waiting on a reaction goes on
    }
    disposed = true;
    group.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    groundMaterial.dispose();
    for (const material of materials) material.dispose();
    birdMat?.dispose();
    birdMesh?.dispose();
  }

  world.scene?.add(group);
  world.effects?.add({
    update(dt) {
      if (disposed) return false;
      update(dt, world.clock.time);
      return !disposed;
    },
  });

  return { group, targets, react, scare, update, dispose };
}
