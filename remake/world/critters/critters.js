import * as THREE from 'three';
import { DONE, Handle } from '../../engine/handle.js';
import { seededRandom } from '../../engine/random.js';
import { clamp, smoothstep } from '../forest/random.js';
import { BEETLE_SIZE, BIRD, KINDS, createModel } from './models.js';

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
//   });
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

function validate(world, { spots, birds, onReact }) {
  if (!Array.isArray(spots)) throw new TypeError('createCritters takes `spots` as a list of { name, kind, position }');
  if (!Array.isArray(birds)) throw new TypeError('createCritters takes `birds` as a list of { name, position }');
  if (world.effects && !world.clock) throw new Error('Critters run on world.effects, so they need world.clock (engine/clock.js) to read the game time from');
  if (onReact !== undefined && typeof onReact !== 'function') throw new TypeError(`onReact is a function (name, kind) that makes the sound of a reaction, not ${typeof onReact}`);
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
function birdMaterial() {
  const e = new THREE.Matrix4().makeRotationZ(BIRD.fold.rotation[2]).multiply(new THREE.Matrix4().makeRotationX(BIRD.fold.rotation[0])).elements;
  const fold = `mat3( ${[e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]].map(v => v.toFixed(6)).join(', ')} )`;
  const [sx, sy, sz] = BIRD.shoulder;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  material.name = 'critter birds';
  material.onBeforeCompile = shader => {
    const anchors = ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>'];
    if (!anchors.every(anchor => shader.vertexShader.includes(anchor))) {
      console.warn('[critters] three\'s standard shader has changed: the birds will not fold or flap their wings');
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aWing; // 0 for the body, +1 for the right wing, -1 for the left
attribute vec2 aFlight; // x: the angle of the wings (down positive), y: 0 at rest, 1 in flight
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
    vec3 folded = BIRD_FOLD * rel + vec3( ${BIRD.fold.offset.map(v => v.toFixed(4)).join(', ')} );
    vec3 w = mix( folded, flown, aFlight.y );
    w.z *= birdSide;
    transformed = pivot + w;
  }`);
  };
  material.customProgramCacheKey = () => 'critter-birds';
  return material;
}

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
export function createCritters(world, { spots = [], birds = [], onReact } = {}) {
  validate(world, { spots, birds, onReact });

  const group = new THREE.Group();
  group.name = 'Critters';
  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  groundMaterial.name = 'critters';
  const geometries = [];
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
  const heightAt = (x, z) => world.heightAt?.(x, z) ?? 0;
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
    const mesh = new THREE.Mesh(model.geometry, groundMaterial);
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
    if (spot.kind === 'frog') {
      // its home and the spot it hops to: along its heading, the ground at the new spot as it is
      c.home = root.position.clone();
      c.far = c.home.clone().add(ahead.set(Math.cos(rad(heading)), 0, Math.sin(rad(heading))).multiplyScalar(HOP.distance));
      c.far.y = c.home.y + heightAt(c.far.x, c.far.z) - heightAt(c.home.x, c.home.z);
    }
    return c;
  });

  /** The way the critter is when it has no reaction going. */
  function rest(c) {
    c.mesh.scale.set(1, 1, 1);
    c.mesh.rotation.set(0, 0, 0);
    c.mesh.position.y = c.model.pivot;
    for (let i = 0; i < c.mesh.morphTargetInfluences.length; i++) c.mesh.morphTargetInfluences[i] = 0;
    if (c.kind === 'frog') {
      c.root.position.copy(c.leg % 2 === 0 ? c.home : c.far);
      c.root.rotation.y = -rad(c.leg === 0 ? c.heading : c.heading + 180 * (c.leg - 1));
    }
    settle(c);
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
    if (!c.reaction) return;
    const tau = time - c.reaction.start;
    if (tau >= durations[c.kind](c)) { finish(c); return; }
    poses[c.kind](c, Math.max(0, tau));
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
