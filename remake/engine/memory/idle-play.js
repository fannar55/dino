import * as THREE from 'three';

/**
 * What the waiting friends do while nobody needs them (the spec's "Bið": one at a time they chase a butterfly, yawn,
 * scratch, sniff at a flower or nudge a friend, and now and then look at the child).
 *
 *   const idle = createIdlePlay({ actors, random, ... });
 *   idle.update(dt, { busy, snap });        // on the game clock, once a frame, before the friends' own update
 *
 * `actors()` lists the friends who may play right now: [{ actor, id, species, partner }] (the world decides: found, at their
 * waiting place, with no task and no walk of their own). While `busy` is true (a script, a cut or a glide, the bubbles, a
 * choice, a friend's task) nothing starts and a running game stops at once: the gesture and the look are dropped and the
 * friend goes back to its spot (over a third of a second; `snap` puts it back in the same frame, for a script that is
 * about to move it). A paused or hidden game (dt <= 0) changes nothing. The camera is never touched.
 *
 * One game at a time, every 6 to 10 seconds of not-busy time (the clock stops while busy, and for a short calm after it).
 * A friend at play stays within REACH metres of the spot it stood on, turns back to its first heading when it is done
 * and never gets nearer to another friend than it was (`clear(actor, point)` says whether it may stand on a point:
 * clear of the leaves in the search view, the water, the boardwalk, the log and the branch). The rest is the world's:
 *   camera()                    the camera (for the look at the child, and which way the butterfly faces)
 *   heightAt(x, z)              the ground
 *   plantNear(x, z, radius)     the nearest plant { x, z, radius } the layout placed within `radius` metres, or null
 *   butterfly                   { group, animate(seconds) }: the existing butterfly model (or null: no chase)
 *   sound(name)                 a soft sound ('giggle')
 * getDebug() has every start (friend, game, time, how long it had waited), for the playthrough's own check.
 */
export const IDLE_GAMES = Object.freeze(['chase-butterfly', 'yawn', 'scratch', 'sniff', 'nudge-friend']);
export const IDLE_GAP = Object.freeze({ min: 6, max: 10 });
const CALM = 1.2; // seconds after a busy spell before the clock for the next game runs again
const REACH = 1.4; // how far from its spot a friend may be at play
const GLANCE = Object.freeze({ min: 14, max: 26, seconds: 1.5 });
const PLAYABLE = ['idle', 'greet', 'delight', 'nuzzle', 'mismatch'];
const turnToward = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

export function createIdlePlay({ actors = () => [], random = Math.random, camera = () => null, heightAt = () => 0, clear = () => true, plantNear = () => null, butterfly = null, sound = () => {}, speed = 1.15 } = {}) {
  let clock = 0, since = 0, nextAt = gap(), calm = 0, retry = 0, reduced = false, active = null, overlaps = 0;
  const log = [], returning = [], glances = new Map(), lastPlayed = new Map(), lastGame = new Map();
  const right = new THREE.Vector3(), point = new THREE.Vector3(), here = new THREE.Vector3();
  function gap() { return IDLE_GAP.min + random() * (IDLE_GAP.max - IDLE_GAP.min); }
  const pick = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const state = actor => actor.getDebugState?.() ?? {};
  const free = entry => { const s = state(entry.actor); return !s.gesture && !s.clip && !s.support && PLAYABLE.includes(s.motion); };

  // ---- walking a little way (never further than REACH from the spot) ----
  function moveToward(player, target, dt) {
    const p = player.actor.root.position, dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
    if (distance < .04) return true;
    const wanted = Math.atan2(-dz, dx), root = player.actor.root;
    root.rotation.y = turnToward(root.rotation.y, wanted, 1 - Math.exp(-dt / .1));
    // It turns to face the way first, then goes.
    if (Math.abs(Math.atan2(Math.sin(wanted - root.rotation.y), Math.cos(wanted - root.rotation.y))) > .5) return false;
    const step = Math.min(distance, speed * dt);
    p.x += dx / distance * step; p.z += dz / distance * step; p.y = heightAt(p.x, p.z) + player.lift;
    return distance - step < .04;
  }
  const faceToward = (player, x, z, dt, rate = .14) => { player.actor.root.rotation.y = turnToward(player.actor.root.rotation.y, Math.atan2(-(z - player.actor.root.position.z), x - player.actor.root.position.x), 1 - Math.exp(-dt / rate)); };
  // A straight way is open when every point along it (and the end) may be stood on.
  function wayClear(player, to) {
    const from = player.spot, count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .35));
    for (let i = 1; i <= count; i++) if (!clear(player.actor, point.set(from.x + (to.x - from.x) * i / count, 0, from.z + (to.z - from.z) * i / count))) return false;
    return true;
  }

  // A gesture of this game's own (so that ending the game never cuts one a script has just started).
  function use(a, name) { const started = a.actor.gesture(name); if (started) a.used.add(name); return started; }

  // ---- the five games: begin(a) says false when it cannot be played now; step(a, dt) says true when it is over ----
  const GAMES = {
    yawn: {
      begin(a) { return use(a, 'yawn'); },
      step(a) { return a.age >= 3; },
    },
    scratch: {
      begin(a) { return use(a, 'scratch'); },
      step(a) { return a.age >= 2.6; },
    },
    // To a plant that is near, or just ahead, then the nose down, then back.
    sniff: {
      begin(a) {
        if (reduced) return false;
        const spot = a.spot, plant = plantNear(spot.x, spot.z, REACH + .9);
        let to = null;
        if (plant) {
          // Stops short of the plant (its own size and a little more), on the way from the spot.
          const dx = plant.x - spot.x, dz = plant.z - spot.z, distance = Math.hypot(dx, dz), stand = Math.min(distance, Math.max(0, distance - plant.radius - .75), REACH);
          if (stand > .25) to = { x: spot.x + dx / distance * stand, z: spot.z + dz / distance * stand };
          a.look = { x: plant.x, z: plant.z };
        }
        // No plant to go to: the ground just ahead of it.
        if (!to || !wayClear(a, to)) {
          const yaw = a.yaw, ahead = { x: spot.x + Math.cos(yaw) * .7, z: spot.z - Math.sin(yaw) * .7 };
          a.look = { x: spot.x + Math.cos(yaw) * 1.4, z: spot.z - Math.sin(yaw) * 1.4 };
          to = wayClear(a, ahead) ? ahead : { x: spot.x, z: spot.z };
        }
        a.to = to; a.phase = 'go'; a.went = Math.hypot(to.x - spot.x, to.z - spot.z) < .1 ? 'in place' : plant && to.x !== spot.x && Math.hypot(to.x - plant.x, to.z - plant.z) < Math.hypot(spot.x - plant.x, spot.z - plant.z) - .2 && a.look.x === plant.x ? 'to a plant' : 'ahead'; return true;
      },
      step(a, dt) {
        const actor = a.actor;
        if (a.phase === 'go') {
          if (!a.walking) { actor.walk(true); a.walking = true; }
          if (moveToward(a, a.to, dt)) { actor.walk(false); a.walking = false; a.phase = 'sniff'; a.phaseAge = 0; faceToward(a, a.look.x, a.look.z, 1, 0); use(a, 'sniff'); }
        } else if (a.phase === 'sniff') {
          a.phaseAge += dt; faceToward(a, a.look.x, a.look.z, dt, .25);
          if (a.phaseAge >= 2.7) a.phase = 'back';
        } else if (a.phase === 'back') {
          if (!a.walking) { actor.walk(true); a.walking = true; }
          if (moveToward(a, a.spot, dt)) { actor.walk(false); a.walking = false; a.phase = 'turn'; a.phaseAge = 0; }
        } else {
          a.phaseAge += dt; actor.root.rotation.y = turnToward(actor.root.rotation.y, a.yaw, 1 - Math.exp(-dt / .12));
          return a.phaseAge >= .4;
        }
        return false;
      },
    },
    // A butterfly flits round the friend's head; it watches, turns after it and hops, then it flies off.
    'chase-butterfly': {
      begin(a) {
        if (reduced || !butterfly) return false;
        const spot = a.spot, facing = camera();
        // A way round that has room: the butterfly flies a ring of about a metre round the friend, wherever the friend is.
        a.ring = { x: spot.x, z: spot.z, radius: 1.05 + random() * .25, turn: random() < .5 ? 1 : -1, phase: random() * Math.PI * 2 };
        if (!facing) return false;
        butterfly.group.visible = true; butterfly.group.scale.setScalar(.01); a.hops = [.9, 2.1, 3.2]; a.looked = true;
        return true;
      },
      step(a, dt) {
        const actor = a.actor, ring = a.ring, age = a.age, comeIn = ease(age / .5), goOut = ease((age - 4.2) / .6);
        const angle = ring.phase + ring.turn * age * 1.9, near = age > 3 && age < 4.2 ? ease((age - 3) / .5) * (1 - ease((age - 3.7) / .5)) : 0;
        const radius = ring.radius * (1 - .62 * near) + goOut * 2;
        point.set(ring.x + Math.cos(angle) * radius, heightAt(ring.x, ring.z) + 1.15 + .3 * Math.sin(age * 2.3) + goOut * 1.6 + near * .1, ring.z + Math.sin(angle) * radius);
        const critter = butterfly.group, cam = camera();
        critter.position.copy(point); critter.scale.setScalar(.55 * Math.max(.01, comeIn * (1 - goOut)));
        if (cam) { right.setFromMatrixColumn(cam.matrixWorld, 0); critter.rotation.set(.9, Math.atan2(-right.z, right.x), 0, 'YXZ'); }
        butterfly.animate(age * 1.4);
        actor.lookAt(point, { weight: .95, maxAngle: 24 });
        faceToward(a, point.x, point.z, dt, .32);
        while (a.hops.length && age >= a.hops[0]) { a.hops.shift(); if (!state(actor).gesture) use(a, 'hop'); }
        if (age >= 4.8) { actor.blink?.(); return true; }
        return false;
      },
      end(a) { if (butterfly) butterfly.group.visible = false; },
    },
    // A shove for the friend beside it, which is knocked a step and giggles.
    'nudge-friend': {
      begin(a) {
        const other = a.entry.partner; if (!other) return false;
        const mate = a.others.find(entry => entry.actor === other);
        if (!mate || !free(mate) || a.actor.root.position.distanceTo(other.root.position) > 3.6) return false;
        // Which side of each the other one stands on.
        const side = (from, to) => { const yaw = from.root.rotation.y; right.set(Math.sin(yaw), 0, Math.cos(yaw)); here.copy(to.root.position).sub(from.root.position); return right.dot(here) >= 0 ? 'right' : 'left'; };
        a.mate = mate; a.mateSpot = other.root.position.clone();
        use(a, `nudge-${side(a.actor, other)}`);
        a.jolted = false; return true;
      },
      step(a) {
        if (!a.jolted && a.age >= .38) {
          a.jolted = true;
          const yaw = a.mate.actor.root.rotation.y; right.set(Math.sin(yaw), 0, Math.cos(yaw)); here.copy(a.actor.root.position).sub(a.mate.actor.root.position);
          a.mate.used = new Set([`jolt-${right.dot(here) >= 0 ? 'right' : 'left'}`]); a.mate.actor.gesture([...a.mate.used][0]);
          if (random() < .6) sound('giggle');
        }
        return a.age >= 1.9;
      },
      end(a) { if (a.mate?.used?.has(state(a.mate.actor).gesture)) a.mate.actor.stopGesture(); },
    },
  };

  // ---- starting, running and stopping a game ----
  function start(entries, waited) {
    // The friend that has waited longest to play (a random one among ties), a game it did not play last time that it can play now.
    const ready = entries.filter(free).sort((a, b) => (lastPlayed.get(a.actor) ?? -Infinity) - (lastPlayed.get(b.actor) ?? -Infinity));
    for (const entry of ready) {
      const player = { entry, actor: entry.actor, others: entries.filter(other => other !== entry), spot: entry.actor.root.position.clone(), yaw: entry.actor.root.rotation.y, lift: 0, age: 0, walking: false, used: new Set(), looked: false };
      player.lift = player.spot.y - heightAt(player.spot.x, player.spot.z);
      const games = [...IDLE_GAMES].filter(name => name !== lastGame.get(entry.actor));
      for (let i = games.length; i > 1; i--) { const j = Math.floor(random() * i); [games[i - 1], games[j]] = [games[j], games[i - 1]]; }
      for (const name of games) {
        const game = GAMES[name];
        if (!game.begin(player)) { endOwn(player); continue; }
        if (log.some(item => item.ended == null)) overlaps++;
        player.game = name; active = player; since = 0; nextAt = gap(); lastPlayed.set(entry.actor, clock); lastGame.set(entry.actor, name);
        player.record = { friend: entry.id, species: entry.species, game: name, t: +clock.toFixed(2), waited: +waited.toFixed(2), at: [+player.spot.x.toFixed(2), +player.spot.z.toFixed(2)], ended: null, stopped: null, seconds: null, far: 0, ...(player.went ? { went: player.went } : {}) };
        log.push(player.record); if (log.length > 400) log.shift();
        return true;
      }
    }
    return false;
  }
  // Drops what this game started and nothing else: its gesture while it still runs, its look.
  function endOwn(player) {
    const actor = player.actor;
    if (player.used.has(state(actor).gesture)) actor.stopGesture();
    if (player.looked) { actor.clearLook(); player.looked = false; }
  }
  function stop(reason, snap) {
    const player = active; if (!player) return;
    active = null;
    const actor = player.actor;
    GAMES[player.game].end?.(player);
    endOwn(player); if (player.walking) actor.walk(false);
    const p = actor.root.position, away = Math.hypot(p.x - player.spot.x, p.z - player.spot.z);
    if (away > .03 || Math.abs(Math.atan2(Math.sin(actor.root.rotation.y - player.yaw), Math.cos(actor.root.rotation.y - player.yaw))) > .03) {
      if (snap) { p.set(player.spot.x, player.spot.y, player.spot.z); actor.root.rotation.y = player.yaw; }
      else returning.push({ actor, from: p.clone(), fromYaw: actor.root.rotation.y, to: player.spot, yaw: player.yaw, age: 0, duration: .3 });
    }
    player.record.ended = +clock.toFixed(2); player.record.stopped = reason; player.record.seconds = +(clock - player.record.t).toFixed(2);
  }
  function settleReturns(dt, snap) {
    for (let i = returning.length - 1; i >= 0; i--) {
      const move = returning[i], p = move.actor.root.position;
      move.age += snap ? move.duration : dt;
      const k = ease(move.age / move.duration);
      p.set(move.from.x + (move.to.x - move.from.x) * k, move.from.y + (move.to.y - move.from.y) * k, move.from.z + (move.to.z - move.from.z) * k);
      move.actor.root.rotation.y = turnToward(move.fromYaw, move.yaw, k);
      if (move.age >= move.duration) returning.splice(i, 1);
    }
  }
  // Now and then each friend looks at the child for a moment (the look layer of its head; never over a gesture).
  function glance(entries, dt) {
    for (const entry of entries) {
      let g = glances.get(entry.actor);
      if (!g) { g = { next: clock + GLANCE.min + random() * (GLANCE.max - GLANCE.min), left: 0 }; glances.set(entry.actor, g); }
      if (g.left > 0) {
        g.left -= dt;
        if (g.left <= 0) { entry.actor.clearLook(); entry.actor.blink?.(); }
      } else if (clock >= g.next) {
        g.next = clock + GLANCE.min + random() * (GLANCE.max - GLANCE.min);
        const cam = camera(), playing = active?.actor === entry.actor;
        if (cam && !playing && free(entry) && !state(entry.actor).looking && !returning.some(move => move.actor === entry.actor)) {
          entry.actor.lookAt(cam.position, { weight: .9, maxAngle: 22 }); g.left = GLANCE.seconds; g.count = (g.count ?? 0) + 1;
        }
      }
    }
  }

  return {
    update(dt, { busy = false, snap = false } = {}) {
      if (!(dt > 0)) return;
      clock += dt;
      if (busy) {
        if (active) stop(snap ? 'script' : 'busy', snap);
        for (const [actor, g] of glances) if (g.left > 0) { actor.clearLook(); g.left = 0; }
        settleReturns(dt, snap); calm = CALM; return;
      }
      settleReturns(dt, false);
      const entries = actors();
      for (const [actor, g] of glances) if (g.left > 0 && !entries.some(entry => entry.actor === actor)) { actor.clearLook?.(); g.left = 0; }
      if (calm > 0) { calm -= dt; glance(entries, dt); return; }
      if (!entries.length) { if (active) stop('nobody', true); since = 0; nextAt = gap(); return; }
      since += dt;
      if (active) {
        active.age += dt;
        // A friend that was chosen for something (or left the list) ends its game on the spot.
        if (!entries.some(entry => entry.actor === active.actor)) stop('claimed', true);
        else if (GAMES[active.game].step(active, dt)) stop('done', false);
        else { const p = active.actor.root.position, d = Math.hypot(p.x - active.spot.x, p.z - active.spot.z); active.record.far = Math.max(active.record.far, +d.toFixed(2)); }
      }
      glance(entries, dt);
      if (!active && since >= nextAt && clock >= retry) {
        if (!start(entries, since)) retry = clock + .4;
      }
    },
    /** A friend is wanted elsewhere (chosen, or a script moves it): its game ends and it is back on its spot now. */
    release(actor) { if (active?.actor === actor) stop('claimed', true); settleReturns(0, true); },
    /** A task or a script is about to start: whatever is going on ends, every friend is back on its spot. */
    settle() { if (active) stop('script', true); settleReturns(0, true); for (const [actor, g] of glances) if (g.left > 0) { actor.clearLook(); g.left = 0; } },
    setReducedMotion(value) { reduced = Boolean(value); if (reduced && active && ['sniff', 'chase-butterfly'].includes(active.game)) stop('reduced', true); },
    /** Everything off, as at a restart. */
    reset() {
      if (active) stop('reset', true);
      settleReturns(0, true);
      for (const [actor, g] of glances) { if (g.left > 0) actor.clearLook?.(); }
      glances.clear(); lastPlayed.clear(); lastGame.clear(); log.length = 0; since = 0; nextAt = gap(); calm = 0; retry = 0; overlaps = 0;
      if (butterfly) butterfly.group.visible = false;
    },
    getDebug: () => ({ active: active ? { friend: active.entry.id, game: active.game, age: +active.age.toFixed(2) } : null, starts: log.slice(), glances: [...glances.values()].reduce((sum, g) => sum + (g.count ?? 0), 0), overlaps, since: +since.toFixed(2), nextAt: +nextAt.toFixed(2), reach: REACH, gap: IDLE_GAP }),
  };
}
