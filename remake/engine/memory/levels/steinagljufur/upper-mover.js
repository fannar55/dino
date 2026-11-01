import * as THREE from 'three';
import { GESTURES, FAIL_TRIES } from '../../gestures.js';
import { createWalkers } from './walkers.js';
import { BORE } from './props.js';
import { CLIMB, wayPoints } from './upper-ground.js';

/**
 * The mover of level 2's steps after the rockfall (levels/steinagljufur/mover.js is the first two's, and delegates these to this): who goes where and what each tap of the child does.
 *
 *   through   everyone (the eight friends and Mosi) goes through the lit tunnel: they gather at its mouth and file in (the Kambeðlur lead, their plates still glowing), and come out of
 *             the exit of the tunnel in the upper gorge (scenes/through.js cuts between the two) and gather on the floor in front of the high ledge
 *   reach     the Þórseðlur stand each side of the slab on the ledge; each tap they stretch their long necks and pull, and the slab comes down a step (three steps) until it lies as a
 *             ramp up the ledge; then everyone walks up the ramp to the terrace
 *   fly       the Flugeðlur carry the rope's free end (the rope is tied at the foot of the cliff): each tap is a wingbeat up the cliff (three legs), at the top they fly round the
 *             tree, winding the rope round its trunk, the rope draws taut, and they land
 *   climb     everyone walks up the steep path with the rope beside them as a handrail (nobody climbs the rope) to the rim
 *   a wrong friend's go at the ledge and at the cliff (`startFail`)
 *
 * Positions are in the upper gorge's frame (upper.js: x forward, z to the right, y up) turned into the scene's by `U.world`. Everything runs on the game clock (update(dt)).
 *
 * Events (the page hears them: levels/steinagljufur.js eventSounds and eventCaptions): 'through-start', 'reach-start', 'slab-step' { index }, 'slab-down', 'fly-start', 'wing-beat' { index },
 * 'rope-lift', 'rope-knots', 'rope-taut', 'rope-tied', 'climb-start', 'climb-step', 'footstep', 'bridge-complete' { id }; the goes: 'fail-bump', 'fail-rope', 'fail-slip', 'fail-done'.
 */
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wayFrame = wayPoints(1);

// ---- where the group stands (the frame's x forward, z to the right; each spot a place on the ground and the way it faces: radians from forward, positive turning to the right) ----
export const FORMATIONS = Object.freeze({
  // on the floor in front of the ledge, as they come out of the tunnel (the Þórseðlur at the front: their go is next)
  floor: { mosi: [-4.8, 1.8], triceratops: [[-6.6, -3.2], [-7, -.4]], stegosaurus: [[-8.6, -2.5], [-9, .2]], brontosaurus: [[-3.2, -3.0], [-3.4, -.2]], pteranodon: [[-10.2, -1.9], [-10.5, .9]] },
  // on the terrace of the ledge, at the foot of the cliff (the Flugeðlur by the rope)
  terrace: { mosi: [8.2, -3.6], triceratops: [[5.6, -4.7], [7.4, -5.2]], stegosaurus: [[5.9, 2.4], [7.7, 2.9]], brontosaurus: [[4.9, -2.7], [4.8, 0]], pteranodon: [[6.5, -1.3], [6.8, .9]] },
  // on the rim, at the end of the climb
  rim: { mosi: [27.6, 7], triceratops: [[28.8, 4.6], [29.4, 7.6]], stegosaurus: [[30.6, 4], [31.2, 7]], brontosaurus: [[32.4, 5.2], [33, 8.2]], pteranodon: [[22.4, 9.5], [25.2, 10.7]] },
});
// the Þórseðlur's places at the ledge: each side of the slab, close under the riser, their long necks over its edges
const REACH_SPOTS = [[.9, -2.7], [.9, 2.7]];
// the slab's steps: angles above the horizontal toward the floor (upper.js slab.steps), and how long each takes
const STEP_SECONDS = 1.05;
// the Flugeðlur's three legs up the cliff (fractions of the way along the path) and the height they fly above it
const LEGS = [.30, .64, 1];

export function createUpperMover({ stage, level, upper: U, rope, plates, events, members, holding, tunnelPoint, lower, setLower, fx, reduced: reducedNow }) {
  // (the walkers keep to the ground under them: the glade's, and the upper gorge's once the group is through)
  const walkers = createWalkers({ stage, ground: (x, z) => where === 'glade' ? stage.heightAt(x, z) : U.heightAt(x, z) });
  const mosi = () => stage.mosi.actor;
  const friends = () => level.friends.flatMap(species => members(species));
  const everyone = () => [...friends(), mosi()];
  const world = (x, z, rise = 0) => U.onGround(x, z, rise).applyMatrix4(U.group.matrixWorld);
  const forward = (turnRight = 0) => U.yawOf(Math.cos(turnRight), Math.sin(turnRight));
  const facing = (from, to) => { const a = U.world(from[0], 0, from[1]), b = U.world(to[0], 0, to[1]); return Math.atan2(-(b.z - a.z), b.x - a.x); };
  let action = null, where = 'glade', time = 0, goes = null;

  // ---- the places ----
  /** Where the friend of `species` (member `i`) or Mosi stands in a formation: a point on the ground (scene's) and its yaw. */
  function spotOf(formation, who, i = 0) {
    const spot = who === 'mosi' ? FORMATIONS[formation].mosi : FORMATIONS[formation][who][i];
    return { point: world(spot[0], spot[1]), yaw: forward(formation === 'floor' ? 0 : 0), frame: spot };
  }
  const slabPoints = across => U.slab.ramp(across).map(p => U.world(p.x, p.y, p.z));
  /** The way up the steep path as points of the scene, `lane` metres to the right of its middle line (negative: to the left, the open side). */
  function pathRoute(lane) {
    return wayFrame.map(([x, z, y], k) => {
      const prev = wayFrame[Math.max(0, k - 1)], next = wayFrame[Math.min(wayFrame.length - 1, k + 1)], dx = next[0] - prev[0], dz = next[1] - prev[1], len = Math.hypot(dx, dz) || 1;
      // (the frame's z is to the right, so the right-hand normal of the direction (dx, dz) is (-dz, dx))
      return U.world(x - dz / len * lane, y, z + dx / len * lane);
    });
  }

  // ---- through ----
  const ENTER = { first: 2.0, every: .26, run: 6.4, walk: 4.4 };
  const ORDER = ['stegosaurus', 'mosi', 'triceratops', 'brontosaurus', 'pteranodon'];
  function startThrough() {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'through', phase: 'gather', age: 0, hidden: 0, total: 9, arrived: 0 };
    events.push({ type: 'through-start' });
    // Each pair's two lanes, metres either side of the bore's middle: the narrower pairs walk closer in (the bore is 2.1 to 2.7 m wide at the friends' feet),
    // and a low lip of rock at the left foot of the mouth (x 2.6 to 3.2) leaves 0.81 m on that side, so the left lane comes in 0.3 m to the right of its
    // line and is back on it 1.5 m in. The Þríhyrnur keep their lanes: side by side they are 2.84 m wide, wider than the bore (veggir).
    const LANES = { stegosaurus: .6, triceratops: .62, brontosaurus: .56, pteranodon: .62 }, LIP = { shift: .3, to: 3.0, back: 1.5 };
    ORDER.forEach((who, g) => {
      const list = who === 'mosi' ? [mosi()] : members(who);
      list.forEach((actor, i) => {
        actor.clearLook?.(); actor.stopGesture?.();
        const lane = who === 'mosi' ? BORE.across : BORE.across + (i ? 1 : -1) * (LANES[who] ?? .62), row = who === 'stegosaurus' ? 0 : g;
        const lip = who !== 'mosi' && who !== 'triceratops' && !i ? LIP.shift : 0, past = lip ? [tunnelPoint(LIP.to, lane + lip), tunnelPoint(LIP.back, lane)] : [];
        const stage1 = tunnelPoint(BORE.mouth + 1.1 + row * .5, lane + lip), enter = tunnelPoint(BORE.mouth - .2, lane + lip), inside = tunnelPoint(-1.7, lane);
        const at = ENTER.first + g * ENTER.every + i * .12;
        walkers.start(actor, [{ to: [stage1], speed: ENTER.run }, { until: at }, { to: [enter, ...past, inside], speed: ENTER.walk }, { hide: true }], { yaw: null, onDone: () => { action.hidden++; } });
      });
    });
  }
  /** The cut: everyone is in the upper gorge, in the dark at the back of the exit; they come out one after the other and gather on the floor. */
  function cutUpper() {
    if (!action || action.id !== 'through' || action.cut) return false;
    action.cut = true; action.phase = 'exit'; action.age = 0; where = 'upper';
    setLower(false); U.show(); walkers.cancelAll(); walkers.resetClock();
    const t0 = walkers.clock(), mouth = U.anchors.exit.mouth.x;
    ORDER.forEach((who, g) => {
      const list = who === 'mosi' ? [mosi()] : members(who);
      list.forEach((actor, i) => {
        const lane = who === 'mosi' ? 0 : (i ? .62 : -.62), spot = spotOf('floor', who, i), inside = world(mouth - 3.2, lane), mouthPoint = world(mouth + .9, lane * 1.4);
        walkers.place(actor, inside, forward(0), false); actor.root.scale.setScalar(.02);
        const delay = g * .3 + i * .1;
        walkers.start(actor, [{ until: t0 + delay }, { pop: .22 }, { to: [world(mouth - 1.2, lane), mouthPoint, spot.point], speed: 5.4 }], { yaw: spot.yaw, onDone: () => { action.arrived++; } });
      });
    });
    return true;
  }
  function updateThrough(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'gather' && a.age >= ENTER.first) a.phase = 'enter';
    if ((a.phase === 'gather' || a.phase === 'enter') && a.hidden >= a.total) a.phase = 'inside';
    if (a.phase === 'exit' && a.arrived >= a.total) { a.phase = 'lineup'; a.age = 0; for (const actor of friends()) actor.lookAt?.(U.world(2, 2, 0), { weight: .5, maxAngle: 18 }); }
    if (a.phase === 'lineup' && a.age >= (reduced() ? .1 : .6)) {
      // the Kambeðlur let the light go: their plates dim (they held it until now)
      holding.delete('stegosaurus'); plates.setAll(0, { duration: reduced() ? 0 : 1.1 });
      for (const actor of friends()) actor.clearLook?.();
      const id = a.id; action = null; events.push({ type: 'bridge-complete', id });
    }
  }

  // ---- reach ----
  const upTo = (who, formation) => { const list = who === 'mosi' ? [mosi()] : members(who); return list.map((actor, i) => ({ actor, spot: spotOf(formation, who, i) })); };
  function startReach(beats) {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'reach', species: 'brontosaurus', phase: 'approach', age: 0, beats: Math.max(0, Math.floor(beats) || 0), given: 0, queue: 0, done: 0, stepAge: 0, from: U.slab.steps[0], to: U.slab.steps[1] };
    events.push({ type: 'reach-start' });
    members('brontosaurus').forEach((actor, i) => {
      actor.clearLook?.(); const spot = world(...REACH_SPOTS[i]);
      walkers.start(actor, [{ to: [spot], speed: 3.2 }], { yaw: facing(REACH_SPOTS[i], [REACH_SPOTS[i][0] + 3, REACH_SPOTS[i][1] * .35]) });
    });
    return true;
  }
  function reachStep() {
    const a = action, index = a.done; a.queue--; a.phase = 'step'; a.stepAge = 0; a.index = index; a.from = U.slab.steps[index]; a.to = U.slab.steps[index + 1];
    for (const actor of members('brontosaurus')) { actor.gesture?.(`pull-${index + 1}`); }
    events.push({ type: 'slab-step', id: 'reach', index });
  }
  function updateReach(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'approach') { if (!walkers.busy()) { a.phase = 'ready'; a.age = 0; for (const actor of members('brontosaurus')) actor.setMotion?.('idle'); } }
    else if (a.phase === 'ready') { if (a.queue > 0) reachStep(); }
    else if (a.phase === 'step') {
      a.stepAge += dt; const seconds = reduced() ? .3 : STEP_SECONDS, u = clamp(a.stepAge / seconds, 0, 1);
      U.slab.set(lerp(a.from, a.to, smooth((u - .12) / .88)));
      if (u >= 1) {
        a.done++;
        if (a.done >= (a.beats || 3)) {
          // the whole slab is down: a thud, dust at its foot, the camera shakes
          a.phase = 'down'; a.age = 0; U.slab.set(U.slab.steps.at(-1));
          const foot = U.world(...U.slab.under(U.slab.length, 0).toArray()); fx?.emit?.('dust', foot, { count: 14, strength: 1.4 }); fx?.emit?.('poof', foot, { count: 7, ring: .8 }); stage.director?.shake?.(.14, .4);
          events.push({ type: 'slab-down' });
        } else a.phase = 'ready';
      }
    } else if (a.phase === 'down') {
      if (a.age >= (reduced() ? .3 : .9)) { a.phase = 'cheer'; a.age = 0; for (const actor of members('brontosaurus')) actor.gesture?.('cheer'); }
    } else if (a.phase === 'cheer') {
      faceCamera('brontosaurus', dt);
      if (a.age >= (reduced() ? .4 : 1.4)) {
        // everyone walks up the ramp to the terrace: two lanes up the slab, then to their places
        a.phase = 'ascend'; a.age = 0; walkers.resetClock();
        const t0 = 0; let k = 0;
        for (const [who, formation] of [['mosi', 'terrace'], ['brontosaurus', 'terrace'], ['triceratops', 'terrace'], ['stegosaurus', 'terrace'], ['pteranodon', 'terrace']]) {
          const list = who === 'mosi' ? [mosi()] : members(who);
          list.forEach((actor, i) => {
            const lane = who === 'mosi' ? 0 : (i ? .85 : -.85), spot = spotOf(formation, who, i), foot = U.slab.ramp(lane).map(p => U.world(p.x, p.y, p.z));
            // (from where it stands: to the foot of the slab, up it, and on to its place on the terrace)
            walkers.start(actor, [{ until: t0 + k * .2 }, { to: [...foot, spot.point], speed: 4, ground: false }], { yaw: spot.yaw, pitch: true });
          });
          k += who === 'mosi' ? 1 : 2;
        }
      }
    } else if (a.phase === 'ascend') {
      if (!walkers.busy()) { const id = a.id; where = 'terrace'; action = null; rope.hang(); rope.show(); events.push({ type: 'bridge-complete', id }); }
    }
  }
  const faceCamera = (species, dt) => {
    const cam = stage.camera();
    for (const actor of members(species)) { const target = Math.atan2(-(cam.z - actor.root.position.z), cam.x - actor.root.position.x), d = Math.atan2(Math.sin(target - actor.root.rotation.y), Math.cos(target - actor.root.rotation.y)); actor.root.rotation.y += d * (reduced() ? 1 : 1 - Math.exp(-dt / .14)); }
  };

  // ---- fly ----
  // The rope lies in a coil at the foot of the cliff, tied to its stake. The Flugeðlur take its free end (A, in front, then B a metre behind: the rope runs through B's beak to A's) and
  // fly it up the cliff in three legs, one for each tap; at the top they circle the tree, winding the rope round its trunk; it draws taut, and they land by the tree.
  const LEG_SPEED = 4.4, WRAP = { radius: 1.15, turns: 1.4, speed: 3.4, behind: 1.15 };
  const frameOf = point => U.local(point);
  const noseFrame = actor => frameOf(actor.getNosePosition());
  const airAt = fraction => { // a point above the path, fraction 0..1 of its length, toward the hillside a little and 2.6 metres up: [x, y, z]
    const k = Math.max(1, Math.min(wayFrame.length - 1, Math.round(fraction * (wayFrame.length - 1)))), [x, z, y] = wayFrame[k];
    return [x, y + 2.7, z + 1.2];
  };
  const circle = angle => { const c = U.tree.base; return [c.x + Math.cos(angle) * WRAP.radius, U.tree.base.y + 1.55, c.z + Math.sin(angle) * WRAP.radius]; };
  function startFly(beats) {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'fly', species: 'pteranodon', phase: 'approach', age: 0, beats: Math.max(0, Math.floor(beats) || 0), given: 0, queue: 0, done: 0, legAge: 0, lift: 0, trail: [], trailAge: 0, b0: null, tight: 0 };
    events.push({ type: 'fly-start' });
    rope.hang(); rope.show();
    members('pteranodon').forEach((actor, i) => {
      actor.clearLook?.(); const spot = [6.7, i ? 1.0 : -1.0];
      walkers.start(actor, [{ to: [world(...spot)], speed: 2.4 }], { yaw: facing(spot, [spot[0] + 3, 0]) });
    });
    return true;
  }
  function ropeFollow() {
    const a = action; if (!a || a.id !== 'fly' || !['ready', 'leg', 'wrap', 'tie'].includes(a.phase)) return;
    const [A, B] = members('pteranodon');
    if (a.phase === 'wrap' || a.phase === 'tie') { rope.carry(a.b0, a.b0, 1); rope.setTrail(a.trail); return; }
    rope.carry(noseFrame(A), noseFrame(B), a.lift);
  }
  function flyLeg(index) {
    const a = action; a.queue--; a.phase = 'leg'; a.leg = index; a.arrived = 0; a.legAge = 0; a.index = index;
    events.push({ type: 'wing-beat', id: 'fly', index }); if (index === 0) events.push({ type: 'rope-lift' });
    const last = index === LEGS.length - 1, theta0 = Math.atan2(airAt(.9)[2] - U.tree.base.z, airAt(.9)[0] - U.tree.base.x) + .0;
    members('pteranodon').forEach((actor, i) => {
      const base = last ? circle(theta0 - (i ? WRAP.behind / WRAP.radius : 0)) : (() => { const p = airAt(LEGS[index]); return [p[0] - (i ? 1.1 : 0), p[1] - (i ? .25 : 0), p[2] + (i ? .5 : -.4)]; })();
      a.theta0 = theta0; actor.carry?.(true);
      const target = U.world(...base), ok = actor.fly?.([target], { speed: LEG_SPEED, onDone: () => { a.arrived++; } });
      if (!ok) { actor.root.position.copy(target); a.arrived++; }
    });
  }
  function startWrap() {
    const a = action; a.phase = 'wrap'; a.age = 0; a.trail = []; a.trailAge = 0; a.b0 = noseFrame(members('pteranodon')[1]); a.arrived = 0;
    events.push({ type: 'rope-knots' });
    const steps = Math.round(WRAP.turns * 14);
    members('pteranodon').forEach((actor, i) => {
      const lag = i ? WRAP.behind / WRAP.radius : 0, points = [];
      for (let k = 1; k <= steps; k++) points.push(U.world(...circle(a.theta0 - lag + k / steps * WRAP.turns * Math.PI * 2)));
      const ok = actor.fly?.(points, { speed: WRAP.speed, onDone: () => { a.arrived++; } }); if (!ok) a.arrived++;
    });
  }
  function updateFly(dt) {
    const a = action; a.age += dt; a.legAge += dt;
    if (a.phase === 'approach') { if (!walkers.busy()) { a.phase = 'ready'; a.age = 0; for (const actor of members('pteranodon')) actor.setMotion?.('idle'); } }
    else if (a.phase === 'ready') { if (a.queue > 0) flyLeg(a.done); }
    else if (a.phase === 'leg') {
      if (a.leg === 0) a.lift = Math.min(1, a.lift + dt / (reduced() ? .2 : 1.2)); else a.lift = 1;
      if (a.arrived >= 2) { a.done++; if (a.done >= (a.beats || 3)) startWrap(); else { a.phase = 'ready'; } }
    } else if (a.phase === 'wrap') {
      a.trailAge += dt; if (a.trailAge >= .06 || !a.trail.length) { a.trailAge = 0; a.trail.push(noseFrame(members('pteranodon')[0])); }
      if (a.arrived >= 2) { a.trail.push(noseFrame(members('pteranodon')[0])); a.phase = 'tie'; a.age = 0; a.tight = 0; events.push({ type: 'rope-taut' });
        // they come down by the tree
        members('pteranodon').forEach((actor, i) => { const spot = FORMATIONS.rim.pteranodon[i], ground = world(spot[0], spot[1]); a.landed = 0; actor.land?.(ground, { yaw: facing(spot, [spot[0] + 1, spot[1] + 5]), onDone: () => { a.landed = (a.landed ?? 0) + 1; } }) || (a.landed = 2); });
      }
    } else if (a.phase === 'tie') {
      a.tight = Math.min(1, a.age / (reduced() ? .3 : 1.7)); rope.tighten(a.tight);
      if (a.tight >= 1 && (a.landed ?? 0) >= 2) { a.phase = 'cheer'; a.age = 0; events.push({ type: 'rope-tied' }); for (const actor of members('pteranodon')) { actor.carry?.(false); actor.gesture?.('cheer'); } }
      else if (a.age > 7) { a.landed = 2; }
    } else if (a.phase === 'cheer') {
      faceCamera('pteranodon', dt);
      if (a.age >= (reduced() ? .4 : 1.5)) { const id = a.id; where = 'cliff'; action = null; events.push({ type: 'bridge-complete', id }); }
    }
    ropeFollow();
    rope.swing(time, a.phase === 'leg' || a.phase === 'ready' ? .22 * Math.max(0, 1 - (a.legAge > 2.5 && a.phase === 'ready' ? (a.legAge - 2.5) / 2 : 0)) : 0);
  }

  // ---- climb ----
  // Everyone but the Flugeðlur (they are at the tree) walks the steep path, Mosi first, the rope on their right (the hillside's side) as a handrail; two abreast, the body pitched with the slope.
  const CLIMB_SPEED = 4.8, STRIDE = 2.6;
  function startClimb() {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'climb', phase: 'walk', age: 0, steps: 0 };
    events.push({ type: 'climb-start' }); events.push({ type: 'climb-step' });
    let k = 0;
    for (const who of ['mosi', 'triceratops', 'stegosaurus', 'brontosaurus']) {
      const list = who === 'mosi' ? [mosi()] : members(who);
      list.forEach((actor, i) => {
        const lane = who === 'mosi' ? .35 : (i ? -.65 : .8), spot = spotOf('rim', who, i), route = pathRoute(lane);
        actor.clearLook?.();
        walkers.start(actor, [{ to: [route[0], ...route, spot.point], speed: CLIMB_SPEED }], { delay: k * .15, yaw: spot.yaw, pitch: true });
        k += 1;
      });
    }
    return true;
  }
  function updateClimb(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'walk') {
      if (a.age >= (a.steps + 1) * STRIDE) { a.steps++; events.push({ type: 'climb-step' }); }
      if (!walkers.busy()) { a.phase = 'cheer'; a.age = 0; for (const actor of friends()) { actor.setMotion?.('idle'); actor.gesture?.('cheer'); } }
    } else if (a.phase === 'cheer' && a.age >= (reduced() ? .4 : 1.3)) { const id = a.id; where = 'rim'; action = null; events.push({ type: 'bridge-complete', id }); }
  }

  // ---- the wrong friends' goes at the ledge and at the cliff ----
  // A wrong pair walks from where it stands to the obstacle, has its funny go (gestures.js FAIL_TRIES; the roots' moves and the stars, the dust and the sounds are here), and walks back.
  // `startFail` gives the scene the times it paces its cuts by, like the mover's goes at the tunnel and the rocks.
  const GOES = {
    'ledge:triceratops': { spots: () => [[.55, -1.15], [.55, 1.15]], events: [[.5, 'dust'], [1.05, 'stars']] },
    'ledge:stegosaurus': { spots: () => [[.35, -1.2], [.35, 1.2]], events: [[1.0, 'dust'], [2.25, 'plop']] },
    'ledge:pteranodon': { spots: () => [[.2, -1.0], [.2, 1.0]], flight: true, seconds: 6.6 },
    'cliff:brontosaurus': { spots: () => [[7.0, -.9], [7.1, .9]], events: [[.5, 'throw'], [2.2, 'rope-lands']], rope: true },
    'cliff:triceratops': { spots: () => [routeFrame(.8, 0), routeFrame(-.55, 0)], events: [[1.55, 'dust'], [2.05, 'dust'], [2.75, 'stars']], path: { to: 3.6, up: [0, 1.55], down: [1.9, 2.55] }, rope: true },
    'cliff:stegosaurus': { spots: () => [routeFrame(.8, 0), routeFrame(-.55, 0)], events: [[1.8, 'slip'], [2.85, 'stars']], path: { to: 4.8, up: [0, 1.75], down: [1.8, 2.5] } },
  };
  // a point of the path's middle line `lane` metres to its right, `s` metres from its start, in the frame: [x, z]
  function routeFrame(lane, s) {
    let walked = 0;
    for (let k = 1; k < wayFrame.length; k++) {
      const a = wayFrame[k - 1], b = wayFrame[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (walked + len >= s || k === wayFrame.length - 1) { const t = Math.min(1, Math.max(0, (s - walked) / len)), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len; return [lerp(a[0], b[0], t) - dz * lane, lerp(a[1], b[1], t) + dx * lane]; }
      walked += len;
    }
    return [wayFrame[0][0], wayFrame[0][1]];
  }
  const headsOf = species => members(species).map(actor => actor.getNosePosition());
  function startFail(species, target, { qa = false } = {}) {
    const key = `${target}:${species}`, go = GOES[key];
    if (action || !go || !GESTURES[FAIL_TRIES_OF[key]]) return null;
    walkers.cancelAll(); walkers.resetClock();
    const formation = target === 'ledge' ? 'floor' : 'terrace', spots = go.spots(), list = members(species);
    // (the cliff's goes start at the foot of the path; the others in front of the obstacle)
    const run = Math.max(...list.map((actor, i) => { const p = world(...spots[i]); return Math.hypot(p.x - actor.root.position.x, p.z - actor.root.position.z) / 3.4; })) + .25;
    const duration = go.seconds ?? GESTURES[FAIL_TRIES_OF[key]].duration + .3;
    action = { id: 'fail', species, target, key, go, phase: 'run', age: 0, run, duration, spots, formation, fired: new Set(), qa, flightStep: null };
    stage.idle?.settle?.();
    list.forEach((actor, i) => {
      actor.clearLook?.(); actor.stopGesture?.(); actor.setMotion?.('idle');
      const spot = spots[i], yaw = go.path ? U.yawOf(...pathDirection(spot)) : forward(0);
      walkers.start(actor, [{ to: [world(...spot)], speed: 3.4 }], { yaw, pitch: Boolean(go.path) });
    });
    return { run, attempt: duration, back: run, total: run * 2 + duration, yaw: forward(0) };
  }
  const pathDirection = spot => { const a = routeFrame(0, 0), b = routeFrame(0, 1.2); void spot; return [b[0] - a[0], b[1] - a[1]]; };
  const FAIL_TRIES_OF = FAIL_TRIES;
  function failEvent(a, what) {
    const heads = headsOf(a.species), at = p => p.clone().add(V(0, .45, 0));
    if (what === 'dust') { for (const p of heads) fx?.emit?.('dust', p.clone().setY(p.y - .6), { count: 5 }); events.push({ type: 'footstep', surface: 'soil', pan: 0 }); }
    else if (what === 'stars') for (const p of heads) fx?.emit?.('stars', at(p), { count: 7 });
    else if (what === 'plop') { for (const actor of members(a.species)) { fx?.emit?.('poof', actor.root.position, { count: 7, ring: .7 }); fx?.emit?.('dust', actor.root.position, { count: 6 }); } for (const p of heads) fx?.emit?.('stars', at(p), { count: 6 }); stage.director?.shake?.(.07, .3); events.push({ type: 'fail-bump', species: a.species }); }
    else if (what === 'throw') { a.throwAt = a.age; events.push({ type: 'fail-rope', species: a.species }); }
    else if (what === 'rope-lands') { for (const p of heads) { fx?.emit?.('stars', at(p), { count: 9 }); fx?.emit?.('poof', p, { count: 4, ring: .4 }); } stage.director?.shake?.(.08, .3); events.push({ type: 'fail-bump', species: a.species }); a.landedAt = a.age; }
    else if (what === 'slip') { for (const actor of members(a.species)) fx?.emit?.('dust', actor.root.position, { count: 8, strength: 1.3 }); events.push({ type: 'fail-slip', species: a.species }); }
  }
  function ropeInMouth(lift = 1) { const [A] = members(action.species), tip = noseFrame(A); rope.carry(tip, tip, lift); }
  function updateFail(dt) {
    const a = action; a.age += dt;
    const list = members(a.species);
    if (a.phase === 'run' || a.phase === 'back') {
      if (!walkers.busy()) {
        if (a.phase === 'back') { const { species, target } = a; for (const actor of list) { actor.setMotion?.('idle'); actor.root.rotation.z = 0; } action = null; events.push({ type: 'fail-done', species, target }); return; }
        a.phase = 'try'; a.age = 0; a.base = list.map(actor => actor.root.position.clone());
        if (a.go.flight) { startDangle(a); return; }
        for (const actor of list) actor.gesture?.(FAIL_TRIES_OF[a.key]);
        if (a.go.rope && a.key === 'cliff:brontosaurus') { a.throwAt = null; }
      }
      return;
    }
    // the try
    for (const [at, what] of a.go.events ?? []) if (a.age >= at && !a.fired.has(`${at}:${what}`)) { a.fired.add(`${at}:${what}`); failEvent(a, what); }
    if (a.go.flight) { updateDangle(a, dt); return; }
    // the roots' moves along the path (the Þríhyrna's hops and tumble, the Kambeðla's climb and slide): metres from the start of the path
    if (a.go.path) {
      const { to, up, down } = a.go.path;
      const s = a.age < up[1] ? to * smooth((a.age - up[0]) / (up[1] - up[0])) : to * (1 - smooth((a.age - down[0]) / (down[1] - down[0])));
      list.forEach((actor, i) => { const lane = i ? -.55 : .8, [x, z] = routeFrame(lane, Math.max(0, s)), p = world(x, z); actor.root.position.set(p.x, p.y + .04, p.z); const [x2, z2] = routeFrame(lane, Math.max(0, s) + .6), q = world(x2, z2), run = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z)); actor.root.rotation.z = a.key === 'cliff:stegosaurus' ? run : run * .8; });
      if (a.key === 'cliff:triceratops') ropeInMouth(Math.min(1, a.age / .4));
    }
    if (a.key === 'cliff:brontosaurus') {
      // the rope: in her mouth, then thrown up (it goes up and a little forward and comes straight down on her head), then it lies there
      const [A] = list;
      if (a.throwAt === null || a.throwAt === undefined) ropeInMouth(Math.min(1, a.age / .4));
      else {
        const t = a.age - a.throwAt, T = 1.65, start = a.throwFrom ??= noseFrame(A), apex = 6.2, u = Math.min(1, t / T);
        const tip = start.clone(); tip.y = start.y + apex * 4 * u * (1 - u); tip.x += 1.6 * Math.sin(Math.PI * u);
        if (u < 1) rope.carry(tip, tip, 1); else if (a.landedAt !== undefined && a.age - a.landedAt > .5) { rope.hang(); }
      }
    }
    if (a.age >= a.duration) { a.phase = 'back'; a.age = 0; rope.hang(); walkers.resetClock(); list.forEach((actor, i) => { actor.root.rotation.z = 0; walkers.start(actor, [{ to: [spotOf(a.formation, a.species, i).point], speed: 3.4 }], { yaw: spotOf(a.formation, a.species, i).yaw }); }); }
  }
  // The Flugeðlur at the ledge: up to the slab's edge, they take hold and hang there (the slab does not move: it is too heavy), kicking; then they let go and drop back to the floor.
  function startDangle(a) {
    a.step = 'up'; a.arrived = 0; a.wait = 0;
    members('pteranodon').forEach((actor, i) => {
      const edge = U.slab.under(U.slab.length - .5, i ? .8 : -.8), hang = U.world(edge.x - .6, edge.y - 1.0, edge.z);
      a.hang = a.hang ?? []; a.hang[i] = hang.clone();
      const ok = actor.fly?.([hang], { speed: 3.1, onDone: () => { a.arrived++; } }); if (!ok) { a.arrived++; actor.root.position.copy(hang); }
    });
  }
  function updateDangle(a, dt) {
    const list = members('pteranodon');
    a.wait += dt;
    if (a.step === 'up' && a.arrived >= 2) { a.step = 'dangle'; a.wait = 0; for (const actor of list) actor.gesture?.('fail-ledge-pteranodon'); }
    else if (a.step === 'dangle') {
      list.forEach((actor, i) => { actor.root.position.copy(a.hang[i]); actor.root.position.y += Math.sin(a.wait * 7 + i) * .06 - .05 * smooth(a.wait / 1.2); });
      if (a.wait >= 2.0) { a.step = 'fall'; a.wait = 0; a.v = 0; for (const actor of list) { actor.cancelFlight?.(); actor.setMotion?.('idle'); } }
    } else if (a.step === 'fall') {
      a.v += 9.8 * dt; let down = 0;
      list.forEach((actor, i) => { const ground = U.groundAt(...U.local(actor.root.position).toArray().filter((_, k) => k !== 1)) + .04; actor.root.position.y = Math.max(ground, actor.root.position.y - a.v * dt); if (actor.root.position.y <= ground + 1e-3) down++; });
      if (down >= 2) { a.step = 'oops'; a.wait = 0; for (const actor of list) { fx?.emit?.('poof', actor.root.position, { count: 7, ring: .7 }); fx?.emit?.('dust', actor.root.position, { count: 5 }); actor.gesture?.('oops'); } for (const p of headsOf('pteranodon')) fx?.emit?.('stars', p.clone().add(V(0, .4, 0)), { count: 7 }); events.push({ type: 'fail-bump', species: 'pteranodon' }); }
    } else if (a.step === 'oops' && a.wait >= 1.2) {
      a.phase = 'back'; a.age = 0; walkers.resetClock();
      list.forEach((actor, i) => { const spot = spotOf(a.formation, 'pteranodon', i); walkers.start(actor, [{ to: [spot.point], speed: 3.4 }], { yaw: spot.yaw }); });
    }
  }

  // ---- the API ----
  function update(dt) {
    if (!(dt > 0)) return;
    time += dt; walkers.update(dt, reduced());
    if (!action) return;
    if (action.id === 'through') updateThrough(dt);
    else if (action.id === 'reach') updateReach(dt);
    else if (action.id === 'fly') updateFly(dt);
    else if (action.id === 'climb') updateClimb(dt);
    else if (action.id === 'fail') updateFail(dt);
  }
  return {
    startFail,
    start(id, { beats = 3 } = {}) {
      if (action) return false;
      if (id === 'through') { startThrough(); return true; }
      if (id === 'reach') return startReach(beats);
      if (id === 'fly') return startFly(beats);
      if (id === 'climb') return startClimb();
      return false;
    },
    beat() {
      if (!action || !action.beats || action.given >= action.beats || !['reach', 'fly'].includes(action.id)) return false;
      const index = action.given; action.given++; action.queue++; events.push({ type: 'beat', id: action.id, index }); return true;
    },
    waitingBeat: () => action && action.beats && action.phase === 'ready' && action.given < action.beats ? action.given : null,
    phase: () => action?.phase ?? null,
    busy: () => action !== null,
    id: () => action?.id ?? null,
    cutUpper, where: () => where,
    /** QA only: everyone at the places of a formation ('floor', 'terrace' or 'rim') in the upper gorge, at once. */
    qaPlace(formation = 'floor') {
      setLower(false); U.show(); where = 'upper'; walkers.cancelAll();
      for (const who of ['mosi', ...level.friends]) (who === 'mosi' ? [mosi()] : members(who)).forEach((actor, i) => { const spot = spotOf(formation, who, i); walkers.place(actor, spot.point, spot.yaw, true); actor.walk?.(false); });
      return true;
    }, setWhere(value) { where = value; },
    walkers, update, goes: () => goes,
    spots: formation => ({ mosi: spotOf(formation, 'mosi').point, ...Object.fromEntries(level.friends.map(species => [species, members(species).map((_, i) => spotOf(formation, species, i).point)])) }),
    reset() { walkers.cancelAll(); action = null; where = 'glade'; goes = null; time = 0; for (const actor of friends()) { actor.root.rotation.x = actor.root.rotation.z = 0; actor.root.scale.setScalar(1); actor.cancelFlight?.(); actor.carry?.(false); } if (mosi()) mosi().root.rotation.z = 0; },
    debug: () => ({ action: action ? { id: action.id, phase: action.phase, age: +action.age.toFixed(2), given: action.given ?? 0, done: action.done ?? 0, hidden: action.hidden ?? 0, arrived: action.arrived ?? 0 } : null, where, walking: walkers.count() }),
  };
  function reduced() { return reducedNow(); }
}
