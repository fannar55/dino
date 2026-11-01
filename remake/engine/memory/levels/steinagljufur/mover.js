import * as THREE from 'three';
import { GESTURES, FAIL_TRIES } from '../../gestures.js';
import { BORE } from './props.js';
import { createUpperMover } from './upper-mover.js';

/**
 * The mover of level 2's first two tasks and their wrong friends (level 1's is levels/berjalundur/adventure.js): who stands where at the tunnel, what each tap of the child
 * does, and the events the page hears (levels/steinagljufur.js eventSounds and eventCaptions say what each sounds and says).
 *
 *   light      the Kambeðlur hop to the tunnel and stand one at each side of its mouth; each tap lights their plates a step (three steps, the tunnel's dark gives way: tunnel.js)
 *   headbutt   the Þríhyrnur hop to the mouth, side by side, noses to the pile; each tap is a charge (back a step, in with the horns) and a hit; the third lets the pile go
 *   fail       a wrong pair has a go: it hops to the obstacle, its funny try (FAIL_TRIES, the moves below), and hops back
 *
 * Everything runs on the game clock (update(dt)). A pair that has lit the tunnel stays where it stands (it holds the light until everyone is through: step-rules.js `holds`).
 * Positions are in the tunnel's own frame (x along the tunnel, the mouth at BORE.mouth, z across), turned into the world's by \`frame\`.
 *
 * Events: { type: 'beat', id, index } (a tap taken), 'light-step' { index }, 'tunnel-lit', 'rocks-hit' { index }, 'rocks-fall', 'rock-land', 'fail-bump' { species }, 'fail-pebble',
 * 'fail-peck', 'fail-done' { species, target }, 'footstep', 'bridge-complete' { id }.
 */
const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - (1 - clamp(t, 0, 1)) ** 2, easeIn = t => clamp(t, 0, 1) ** 2;
const HOP = { reach: 2.4, speed: 5.6, arc: .2, min: .6, max: 1.6 };
// How far the plates and the dark have come after each tap (the last is the whole light).
const STEPS = Object.freeze([.38, .7, 1]);
const GAP = .5; // metres between the horns and the pile when the Þríhyrnur stand at rest, and how far back they rear
const REAR = .34;
const STRIKE = { seconds: .95, hit: .52 };

export function createGorgeMover({ THREE: three = THREE, stage, interior, plates, tunnel, level, upper, rope, setLower = () => {} }) {
  void three;
  const { fx, nests, heightAt } = stage;
  const across = BORE.across;
  const events = [];
  const pairs = Object.fromEntries(level.friends.map(species => [species, { members: [], ready: false }]));
  const holding = new Set();
  let action = null, snapshot = { selected: null }, reduced = false, time = 0;

  // ---- places in the tunnel's frame ----
  const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(tunnel.quaternion), side = new THREE.Vector3(0, 0, 1).applyQuaternion(tunnel.quaternion);
  const ground = (x, z, rise = .04) => { const p = interior.local(x, 0, z); p.y = heightAt(p.x, p.z) + rise; return p; };
  // The yaw of an actor that faces the direction (dx along the tunnel, dz across).
  const yawOf = (dx, dz) => { const d = facing.clone().multiplyScalar(dx).addScaledVector(side, dz); return Math.atan2(-d.z, d.x); };
  const members = species => pairs[species]?.members ?? [];
  const homePoint = (species, member) => { const nest = nests.find(n => n.species === species); return nest ? nest.root.position.clone().add(nest.restOffsets?.[member] ?? new THREE.Vector3()) : ground(0, 0); };
  const homeYaw = species => nests.find(n => n.species === species)?.restYaw ?? 0;
  const noseOf = actor => actor.noseLocal?.x ?? 1.3;

  // The two members' spots at each task: [{ point, yaw }] by member.
  const SPOTS = {
    // The Kambeðlur: one at each side of the mouth, a little out in front of it, turned in to it (their plates shine on it from both sides).
    light: () => [-1, 1].map(sign => ({ point: ground(BORE.mouth + 1.15, across + sign * 2.55), yaw: yawOf(-1.0, -sign * 2.4) })),
    // The Þríhyrnur: side by side in the mouth, noses to the pile (`reach`: how far the root has gone from its rest toward the pile).
    ram: (reach, front = interior.pile.frontX()) => members('triceratops').map((actor, i) => ({ point: ground(front + noseOf(actor) + GAP - reach, across + (i ? .78 : -.78)), yaw: yawOf(-1, 0) })),
  };
  // Where each wrong friend stands to have its go (rest of the go), by 'obstacle:species'.
  const FAIL_SPOTS = {
    'tunnel:triceratops': () => members('triceratops').map((a, i) => ({ point: ground(interior.pile.frontX() + noseOf(a) + GAP + .85, across + (i ? .8 : -.8)), yaw: yawOf(-1, 0) })),
    'tunnel:brontosaurus': () => members('brontosaurus').map((a, i) => ({ point: ground(BORE.mouth + noseOf(a) + .35, across + (i ? .75 : -.75)), yaw: yawOf(-1, 0) })),
    'tunnel:pteranodon': () => members('pteranodon').map((a, i) => ({ point: ground(BORE.mouth + 1.15, across + (i ? .95 : -.95)), yaw: yawOf(-1, 0) })),
    'rocks:stegosaurus': () => members('stegosaurus').map((a, i) => ({ point: ground(interior.pile.frontX() + 1.35, across + (i ? .72 : -.72)), yaw: yawOf(1, 0) })),
    'rocks:brontosaurus': () => members('brontosaurus').map((a, i) => ({ point: ground(interior.pile.frontX() + noseOf(a) + .08, across + (i ? .7 : -.7)), yaw: yawOf(-1, 0) })),
    'rocks:pteranodon': () => members('pteranodon').map((a, i) => ({ point: ground(interior.pile.frontX() + noseOf(a) + .45, across + (i ? .85 : -.85)), yaw: yawOf(-1, 0) })),
  };
  // The moves of each go while its gesture plays (seconds of the go): [from, to, metres toward the pile along the tunnel]; the legs walk while the root moves.
  const FAIL_MOVES = {
    'tunnel:triceratops': [[0, 1.05, 1.35], [1.95, 3, -1.35]],
    'tunnel:brontosaurus': [[0, .9, .6], [2.0, 2.95, -.6]],
  };
  // What happens at moments of a go (seconds into it): the bump, the pebble, the pecks.
  const FAIL_EVENTS = {
    'tunnel:triceratops': [[1.0, 'bump'], [1.45, 'stars']],
    'tunnel:brontosaurus': [[1.2, 'bonk-roof'], [1.7, 'stars']],
    'rocks:stegosaurus': [[1.0, 'pebble'], [1.5, 'stars']],
    'rocks:brontosaurus': [[.3, 'nudge'], [.85, 'nudge']],
    'rocks:pteranodon': [[.25, 'peck'], [.55, 'peck'], [.85, 'peck']],
  };

  // How long a go takes when it is longer than its gesture: the Flugeðla's flight in, bump, tumble out, landing and shake (the scene paces its cuts by it).
  const TRY_SECONDS = { 'tunnel:pteranodon': 5.8 };
  const hopsTo = (species, spots) => members(species).map((actor, i) => {
    const from = actor.root.position.clone(), to = spots[i].point, distance = Math.hypot(to.x - from.x, to.z - from.z);
    return { actor, from, fromYaw: actor.root.rotation.y, to, yaw: spots[i].yaw, count: Math.max(2, Math.round(distance / HOP.reach)), duration: clamp(distance / HOP.speed, HOP.min, HOP.max), hop: -1 };
  });
  const hopLanding = actor => { fx?.emit?.('poof', actor.root.position, { count: 3, ring: .3 }); events.push({ type: 'footstep', surface: 'soil', pan: 0 }); };
  function hopAlong(h, t, back) {
    const actor = h.actor, from = back ? h.to : h.from, to = back ? h.from : h.to, run = Math.min(1, t), phase = h.count * run, hop = Math.min(h.count - 1, Math.floor(phase));
    if (hop !== h.hop) { if (h.hop >= 0) hopLanding(actor); h.hop = hop; actor.gesture?.('hop'); }
    const x = lerp(from.x, to.x, run), z = lerp(from.z, to.z, run);
    actor.root.position.set(x, heightAt(x, z) + .04 + (run < 1 ? HOP.arc * Math.sin(Math.PI * (phase - hop)) : 0), z); actor.root.position.y += stage.hopOver?.(actor.root.position) ?? 0;
    const travel = Math.atan2(-(to.z - from.z), to.x - from.x), wanted = run > .75 ? (back ? h.fromYaw : h.yaw) : travel, d = Math.atan2(Math.sin(wanted - actor.root.rotation.y), Math.cos(wanted - actor.root.rotation.y));
    actor.root.rotation.y += d * (reduced ? 1 : Math.min(1, .25 + run * .3));
  }
  const landHops = (hops, back) => { for (const h of hops) { h.hop = -1; h.actor.root.position.copy(back ? h.from : h.to); h.actor.root.rotation.y = back ? h.fromYaw : h.yaw; hopLanding(h.actor); } };
  const headsOf = species => members(species).map(actor => actor.getNosePosition?.() ?? actor.root.position.clone().add(new THREE.Vector3(0, 1, 0)));
  const stand = species => { for (const actor of members(species)) { actor.clearLook?.(); actor.clearSupport?.(); actor.walk?.(false); } };
  // The steps after the rockfall (through the tunnel, the ledge, the cliff, the climb: upper-mover.js) and their wrong friends' goes at the ledge and at the cliff.
  const up = createUpperMover({ stage, level, upper, rope, plates, events, members, holding, tunnelPoint: (x, z) => ground(x, z, 0), setLower, fx, reduced: () => reduced });
  const busy = () => action !== null || up.busy();
  // A cheer is for the child: the pair turns to face the camera (the way they stood, in to the tunnel, shows only their backs).
  const faceCamera = (species, dt) => {
    const cam = stage.camera();
    for (const actor of members(species)) {
      const target = Math.atan2(-(cam.z - actor.root.position.z), cam.x - actor.root.position.x), d = Math.atan2(Math.sin(target - actor.root.rotation.y), Math.cos(target - actor.root.rotation.y));
      actor.root.rotation.y += d * (reduced ? 1 : 1 - Math.exp(-dt / .14));
    }
  };

  // ---- the light ----
  function startLight(beats) {
    const spots = SPOTS.light();
    stand('stegosaurus');
    action = { id: 'light', species: 'stegosaurus', phase: 'approach', age: 0, beats: Math.max(0, Math.floor(beats) || 0), given: 0, queue: 0, done: 0, hops: hopsTo('stegosaurus', spots), spots, stepAge: 0 };
    action.duration = Math.max(...action.hops.map(h => h.duration));
    return true;
  }
  function lightStep() {
    const a = action, index = a.done; a.queue--; a.phase = 'step'; a.stepAge = 0; a.index = index;
    for (const actor of members('stegosaurus')) actor.gesture?.('glow');
    plates.setAll(STEPS[index] ?? 1, { duration: reduced ? 0 : .8 }); interior.light(STEPS[index] ?? 1, { seconds: .8 });
    events.push({ type: 'light-step', id: 'light', index });
  }
  function updateLight(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'approach') {
      a.hops.forEach(h => hopAlong(h, a.age / h.duration, false));
      if (a.age >= a.duration) { landHops(a.hops, false); a.phase = 'ready'; a.age = 0; for (const actor of members('stegosaurus')) actor.setMotion?.('idle'); }
    } else if (a.phase === 'ready') {
      if (a.queue > 0) lightStep();
    } else if (a.phase === 'step') {
      a.stepAge += dt;
      if (a.stepAge >= (reduced ? .3 : .85)) {
        a.done++; a.phase = 'ready';
        if (a.done >= (a.beats || 3)) { a.phase = 'lit'; a.age = 0; }
        else if (a.queue > 0) lightStep();
      }
    } else if (a.phase === 'lit') {
      // The whole light has come; a moment, then the tunnel is lit and the pair cheers.
      if (a.age >= (reduced ? .2 : .55) && !a.litSaid) { a.litSaid = true; events.push({ type: 'tunnel-lit' }); for (const actor of members('stegosaurus')) actor.gesture?.('cheer'); }
      if (a.litSaid) faceCamera('stegosaurus', dt);
      if (a.litSaid && a.age >= (reduced ? .6 : 2.3)) { holding.add('stegosaurus'); const id = a.id; action = null; events.push({ type: 'bridge-complete', id }); }
    }
  }

  // ---- the headbutt ----
  function startHeadbutt(beats) {
    stand('triceratops');
    const front = interior.pile.frontX(), spots = SPOTS.ram(0, front);
    action = { id: 'headbutt', species: 'triceratops', phase: 'approach', age: 0, front, beats: Math.max(0, Math.floor(beats) || 0), given: 0, queue: 0, done: 0, hops: hopsTo('triceratops', spots), spots, strikeAge: 0, reach: 0, fall: 0 };
    action.duration = Math.max(...action.hops.map(h => h.duration));
    return true;
  }
  const strikeSeconds = () => STRIKE.seconds * (reduced ? .5 : 1);
  function strike() {
    const a = action; a.queue--; a.phase = 'strike'; a.strikeAge = 0; a.index = a.done; a.hitDone = false;
    for (const actor of members('triceratops')) actor.gesture?.('charge');
  }
  // How far the horns have gone from where the pair rests toward the pile, over one strike (u 0 to 1): a rear back, the drive in (to GAP, the pile's face; a little more on the last), the hold and the way back.
  function strikeReach(u, index) {
    const dive = GAP + .07 * index + (index >= 2 ? .1 : 0);
    if (u < .3) return -REAR * easeOut(u / .3);
    if (u < STRIKE.hit) return lerp(-REAR, dive, easeIn((u - .3) / (STRIKE.hit - .3)));
    if (u < .6) return dive;
    return lerp(dive, 0, easeOut((u - .6) / .4));
  }
  function updateHeadbutt(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'approach') {
      a.hops.forEach(h => hopAlong(h, a.age / h.duration, false));
      if (a.age >= a.duration) { landHops(a.hops, false); a.phase = 'ready'; for (const actor of members('triceratops')) actor.setMotion?.('idle'); }
    } else if (a.phase === 'ready') {
      if (a.queue > 0) strike();
    } else if (a.phase === 'strike') {
      a.strikeAge += dt;
      const u = Math.min(1, a.strikeAge / strikeSeconds());
      a.reach = strikeReach(u, a.index);
      placeRam(a.reach);
      if (!a.hitDone && u >= STRIKE.hit) {
        a.hitDone = true; const index = a.index;
        // The horns meet the pile: dust and a shake, the pile gives (a shove, the last lets go), and the sound.
        for (const point of headsOf('triceratops')) { fx?.emit?.('dust', point, { count: 8, strength: 1.2 }); fx?.emit?.('poof', point, { count: 5, ring: .4 }); }
        stage.director?.shake?.(.1 + .06 * index, .32 + .1 * index);
        interior.pile.hit(index);
        events.push({ type: 'rocks-hit', index });
        if (index >= 2) { events.push({ type: 'rocks-fall' }); a.fallAge = 0; }
      }
      if (u >= 1) {
        a.done++; a.reach = 0; placeRam(0);
        if (a.done >= (a.beats || 3)) { a.phase = 'fall'; a.fallAge = a.fallAge ?? 0; }
        else a.phase = 'ready';
      }
    } else if (a.phase === 'fall') {
      a.fallAge += dt;
      for (const event of interior.pile.poll()) events.push({ type: 'rock-land' }), void event;
      if (!interior.pile.isFalling() && a.fallAge > (reduced ? .5 : 1.4)) {
        a.phase = 'cheer'; a.age = 0;
        for (const actor of members('triceratops')) actor.gesture?.('cheer');
        for (const point of headsOf('triceratops')) fx?.emit?.('stars', point.clone().add(new THREE.Vector3(0, .5, 0)), { count: 8 });
      }
    } else if (a.phase === 'cheer') {
      faceCamera('triceratops', dt);
      if (a.age >= (reduced ? .5 : 1.5)) {
        // Back home: the same hops as the way there.
        const spots = members('triceratops').map(() => null).map((_, i) => ({ point: homePoint('triceratops', i), yaw: homeYaw('triceratops') }));
        a.hops = hopsTo('triceratops', spots); a.phase = 'home'; a.age = 0; a.duration = Math.max(...a.hops.map(h => h.duration));
        stand('triceratops');
      }
    } else if (a.phase === 'home') {
      a.hops.forEach(h => hopAlong(h, a.age / h.duration, false));
      if (a.age >= a.duration) {
        for (const h of a.hops) { h.actor.root.position.copy(h.to); h.actor.root.rotation.y = h.yaw; hopLanding(h.actor); h.actor.setMotion?.('idle'); h.actor.greet?.(); }
        const id = a.id; action = null; events.push({ type: 'bridge-complete', id });
      }
    }
    if (action && a.phase !== 'approach' && a.phase !== 'home' && a.phase !== 'cheer' && a.phase !== 'strike' && a.phase !== 'fall') placeRam(0);
  }
  // The pair at its spot, `reach` metres further toward the pile than at rest.
  function placeRam(reach) {
    const spots = SPOTS.ram(reach, action.front);
    members('triceratops').forEach((actor, i) => { const p = spots[i].point; actor.root.position.set(p.x, heightAt(p.x, p.z) + .04, p.z); actor.root.rotation.y = spots[i].yaw; });
  }

  // ---- a wrong friend's go ----
  // A wrong go belongs to a pair the bubbles offer, and a pair that holds the light is never offered (step-rules.js `holds`): the game never asks it. Only QA does (`qa: true`, the
  // playthrough's --qa-fail: the Kambeðlur's go at the rocks, which the spec names): it hops away and back to where it stood, and the light it holds is not touched (the plates and the
  // tunnel keep their level, the pair keeps holding) while it does.
  function startFail(species, target, { qa = false } = {}) {
    const key = `${target}:${species}`;
    if (target === 'ledge' || target === 'cliff') return action || !pairs[species]?.ready ? null : up.startFail(species, target, { qa });
    if (action || up.busy() || !pairs[species]?.ready || !FAIL_SPOTS[key] || holding.has(species) && !qa) return null;
    const spots = FAIL_SPOTS[key](), gesture = FAIL_TRIES[key], duration = TRY_SECONDS[key] ?? GESTURES[gesture].duration;
    stand(species);
    const hops = hopsTo(species, spots), run = Math.max(...hops.map(h => h.duration));
    action = { id: 'fail', species, target, key, phase: 'run', age: 0, duration: run, hops, spots, gesture, tryLength: duration, fired: new Set(), flights: 0, walking: false };
    return { run, attempt: duration, back: run, total: run * 2 + duration, yaw: spots[0].yaw };
  }
  function failEvent(a, what) {
    const heads = headsOf(a.species);
    if (what === 'bump') { for (const p of heads) { fx?.emit?.('poof', p, { count: 6, ring: .35 }); fx?.emit?.('stars', p.clone().add(new THREE.Vector3(0, .35, 0)), { count: 8 }); } stage.director?.shake?.(.08, .3); interior.pile.shiver(); events.push({ type: 'fail-bump', species: a.species }); }
    else if (what === 'bonk-roof') { for (const p of heads) { fx?.emit?.('dust', p.clone().add(new THREE.Vector3(0, .35, 0)), { count: 6 }); fx?.emit?.('stars', p.clone().add(new THREE.Vector3(0, .3, 0)), { count: 8 }); } stage.director?.shake?.(.07, .3); events.push({ type: 'fail-bump', species: a.species }); }
    else if (what === 'stars') for (const p of heads) fx?.emit?.('stars', p.clone().add(new THREE.Vector3(0, .5, 0)), { count: 6 });
    else if (what === 'nudge') { for (const p of heads) fx?.emit?.('dust', p, { count: 3 }); events.push({ type: 'footstep', surface: 'soil', pan: 0 }); }
    else if (what === 'peck') { for (const p of heads) fx?.emit?.('dust', p, { count: 2 }); events.push({ type: 'fail-peck', species: a.species }); }
    else if (what === 'pebble') {
      // The tail sends one of the pile's small stones over her back onto her head, and it bounces off.
      const local = interior.pile.top(), sendTo = actor => { const to = actor.getNosePosition?.() ?? actor.root.position; return tunnel.worldToLocal(to.clone().add(new THREE.Vector3(0, .12, 0))); };
      members(a.species).forEach((actor, i) => { const to = sendTo(actor), from = tunnel.worldToLocal(local.clone()); interior.pile.pebble(i, [from.x, from.y, from.z], [to.x, to.y, to.z], { seconds: .55, side: [(i ? .5 : -.4), (i ? .5 : -.5)] }); });
      a.pebbleAt = a.age + .55;
    }
  }
  function updateFail(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'run' || a.phase === 'back') {
      a.hops.forEach(h => hopAlong(h, a.age / h.duration, a.phase === 'back'));
      if (a.age >= a.duration) {
        landHops(a.hops, a.phase === 'back');
        if (a.phase === 'back') { const { species, target } = a; for (const actor of members(species)) actor.setMotion?.('idle'); action = null; events.push({ type: 'fail-done', species, target }); return; }
        a.phase = 'try'; a.age = 0; a.duration = a.tryLength; a.base = a.hops.map(h => h.to.clone());
        if (a.key === 'tunnel:pteranodon') { startFlightTry(a); return; }
        for (const actor of members(a.species)) actor.gesture?.(a.gesture);
      }
      return;
    }
    // the try
    for (const [at, what] of FAIL_EVENTS[a.key] ?? []) if (a.age >= at && !a.fired.has(`${at}:${what}`)) { a.fired.add(`${at}:${what}`); failEvent(a, what); }
    if (a.pebbleAt !== undefined && a.age >= a.pebbleAt && !a.fired.has('plink')) { a.fired.add('plink'); events.push({ type: 'fail-pebble', species: a.species }); for (const p of headsOf(a.species)) fx?.emit?.('stars', p.clone().add(new THREE.Vector3(0, .3, 0)), { count: 7 }); }
    if (a.key === 'tunnel:pteranodon') { updateFlightTry(a, dt); return; }
    // the root's moves: toward the pile along the tunnel (walking), then back
    const moves = FAIL_MOVES[a.key] ?? [];
    let metres = 0, walking = false;
    for (const [from, to, m] of moves) { const u = clamp((a.age - from) / (to - from), 0, 1); metres += m * smooth(u); walking ||= u > 0 && u < 1; }
    // (the metres sum: a move toward the pile is positive, the way back negative, so they cancel when the go is over)
    const fromTunnel = facing.clone().multiplyScalar(-1);
    members(a.species).forEach((actor, i) => {
      const base = a.base[i]; actor.root.position.set(base.x + fromTunnel.x * metres, heightAt(base.x + fromTunnel.x * metres, base.z + fromTunnel.z * metres) + .04, base.z + fromTunnel.z * metres);
      if (walking !== a.walking) actor.walk?.(walking);
    });
    a.walking = walking;
    if (a.age >= a.duration) {
      members(a.species).forEach((actor, i) => { actor.walk?.(false); actor.root.position.copy(a.base[i]); });
      a.phase = 'back'; a.age = 0; a.duration = Math.max(...a.hops.map(h => h.duration));
    }
  }
  // The Flugeðlur at the tunnel: up and in through the mouth at the height of the dark, a bump, out again head over tail, and down on the spot.
  function startFlightTry(a) {
    a.step = 'in'; a.arrived = 0; a.landed = 0; a.wait = 0; a.canFly = members(a.species).every(actor => actor.getFlight !== undefined && actor.fly);
    const inPoint = i => interior.local(BORE.mouth - .75, 1.15, across + (i ? .95 : -.95));
    let any = false;
    members(a.species).forEach((actor, i) => { const flying = actor.fly?.([inPoint(i)], { speed: 2.8, onDone: () => { a.arrived++; } }); any ||= Boolean(flying); if (!flying) a.arrived++; });
    if (!any) a.step = 'bump';
    a.duration = 12;
  }
  function updateFlightTry(a, dt) {
    a.wait += dt;
    if (a.step === 'in' && a.arrived >= members(a.species).length) {
      a.step = 'out'; a.arrived = 0; a.wait = 0; failEvent(a, 'bump');
      const outPoint = i => interior.local(BORE.mouth + 1.15, 1.1, across + (i ? .95 : -.95));
      members(a.species).forEach((actor, i) => { actor.gesture?.(a.gesture); const flying = actor.fly?.([outPoint(i)], { speed: 3.4, onDone: () => { a.arrived++; } }); if (!flying) a.arrived++; });
    } else if (a.step === 'bump') { a.step = 'out'; a.arrived = members(a.species).length; failEvent(a, 'bump'); members(a.species).forEach(actor => actor.gesture?.(a.gesture)); }
    if (a.step === 'out' && a.arrived >= members(a.species).length) {
      a.step = 'land'; a.landed = 0;
      members(a.species).forEach((actor, i) => { const spot = a.spots[i]; const landing = actor.land?.(spot.point, { yaw: spot.yaw, onDone: () => { a.landed++; } }); if (!landing) a.landed++; });
    }
    if (a.step === 'land' && a.landed >= members(a.species).length) { a.step = 'shake'; a.wait = 0; for (const actor of members(a.species)) actor.gesture?.('oops'); }
    if (a.step === 'shake' && a.wait >= 1.3) finishFlightTry(a);
    if (a.wait > 9) finishFlightTry(a); // (a flight that never ends is not waited for)
  }
  function finishFlightTry(a) {
    members(a.species).forEach((actor, i) => { actor.cancelFlight?.(); actor.setMotion?.('idle'); actor.root.position.copy(a.spots[i].point); actor.root.rotation.y = a.spots[i].yaw; });
    a.phase = 'back'; a.age = 0; a.duration = Math.max(...a.hops.map(h => h.duration));
    a.hops.forEach(h => { h.hop = -1; });
  }

  // The conditions of each step after the rockfall (the step rules' state, level.flags): the rocks gone, everyone found and home; through, then the pair of the step is home.
  function startUpper(id, beats) {
    const state = snapshot, ready = species => pairs[species].ready;
    if (id === 'through' && state.rocksFallen && !state.throughTunnel && level.friends.every(ready)) return up.start('through');
    if (id === 'fly' && state.ledgeLowered && !state.ropeUp && ready('pteranodon') && state.selected === 'pteranodon') return up.start('fly', { beats });
    if (id === 'climb' && state.ropeUp && !state.atClifftop && level.friends.every(ready)) return up.start('climb');
    if (id === 'reach' && state.throughTunnel && !state.ledgeLowered && ready('brontosaurus') && state.selected === 'brontosaurus') return up.start('reach', { beats });
    return false;
  }

  return {
    pairs,
    /** The two of a species are home (the world binds them when both have walked there). */
    bindPair(species, list) { if (pairs[species] && !pairs[species].ready && list.length === 2) pairs[species] = { members: list, ready: true }; },
    ownsPair: species => Boolean(action && action.species === species) || holding.has(species) || up.where() !== 'glade',
    holds: species => holding.has(species),
    /** QA only: a pair holds the light. */
    hold: species => { holding.add(species); },
    pairCentre(species) { const list = members(species); return list.length ? list.reduce((sum, actor) => sum.add(actor.root.position), new THREE.Vector3()).multiplyScalar(1 / list.length).add(new THREE.Vector3(0, 1, 0)) : new THREE.Vector3(); },
    hasReservation: actor => Boolean(action && members(action.species).includes(actor)) || [...holding].some(species => members(species).includes(actor)) || up.where() !== 'glade' || up.busy(),
    setState(value) { snapshot = value ?? {}; },
    isBusy: busy,
    /** Starts a task (false when it cannot start now). `beats`: the taps the child gives it. */
    start(id, { beats = 3 } = {}) {
      if (action || up.busy()) return false;
      if (['through', 'reach', 'fly', 'climb'].includes(id)) return startUpper(id, beats);
      if (id === 'light' && pairs.stegosaurus.ready && snapshot.selected === 'stegosaurus' && !holding.has('stegosaurus') && !snapshot.tunnelLit) return startLight(beats);
      if (id === 'headbutt' && pairs.triceratops.ready && snapshot.selected === 'triceratops' && snapshot.tunnelLit && !snapshot.rocksFallen) return startHeadbutt(beats);
      return false;
    },
    /** One tap of the child: the next step of the task (queued if the last one is still going). False when there is none left to give. */
    beat() {
      if (up.busy()) return up.beat();
      if (!action || !action.beats || action.given >= action.beats || !['light', 'headbutt'].includes(action.id)) return false;
      const index = action.given; action.given++; action.queue++;
      events.push({ type: 'beat', id: action.id, index });
      return true;
    },
    /** The number of the beat the pair waits for (the first is 0), or null while it is not ready for one. */
    waitingBeat: () => up.busy() ? up.waitingBeat() : action && action.beats && ['ready'].includes(action.phase) && action.given < action.beats ? action.given : null,
    /** The phase of the task or go that runs now ('approach', 'ready', 'step', 'lit', 'strike', 'fall', 'cheer', 'home', 'run', 'try', 'back'), or null. */
    phase: () => up.busy() ? up.phase() : action?.phase ?? null,
    /** The lit tunnel (the whole light has come) and the fallen pile. */
    lit: () => Boolean(holding.has('stegosaurus') || (action?.id === 'light' && action.litSaid)),
    startFail,
    update(dt) {
      if (!(dt > 0)) return;
      time += dt; up.update(dt);
      if (!action) return;
      if (action.id === 'light') updateLight(dt);
      else if (action.id === 'headbutt') updateHeadbutt(dt);
      else if (action.id === 'fail') updateFail(dt);
    },
    pollEvents: () => events.splice(0),
    setReducedMotion(value) { reduced = Boolean(value); },
    reset() { up.reset(); action = null; holding.clear(); events.length = 0; for (const species of Object.keys(pairs)) pairs[species] = { members: [], ready: false }; },
    upper: up,
    debug: () => ({ up: up.debug(), action: action ? { id: action.id, phase: action.phase, age: +action.age.toFixed(2), species: action.species, target: action.target ?? null, given: action.given ?? 0, done: action.done ?? 0 } : null, holding: [...holding], pairs: Object.fromEntries(Object.entries(pairs).map(([species, pair]) => [species, { ready: pair.ready }])) }),
    /** Where the pair of a species stands at a task now: for the scenes' shots. */
    spots: kind => (kind === 'light' ? SPOTS.light() : SPOTS.ram(0)).map(spot => spot.point),
    time: () => time,
  };
}
