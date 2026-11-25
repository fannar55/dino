// The festival's small guests (spec 3, scene 1: "flugdýrin setjast á steinana", "froskar, skjaldbökur og smáeðlur hoppa af bakinu á
// henni", "dýrakórinn á eftir sér"): chapter 5's choir and two more flyers, the valley's own baked critters (world/ardalur/animals.js
// loadCritters, drawn by world/critters/crowd.js createCrowds: one draw call a kind and level), each with a seat on the top's rim
// behind the dance floor, off every friend's stand and the stage. They come with their friends (hatid-arrival.js): the flyers glide
// in with Flugeðla, the frogs, turtles and lizards hop off Uggeðla's back, the grazers walk up out of the cloud behind Slóeðla.
//
//   GUESTS                          how many of each group come (chapter 5's CHOIR: grazers 3, turtles 3, frogs 5, lizards 6, flyers 4; and
//                                   two more flyers), 23 in all: BUDGET.guests
//   guestCounts(budget)             GUESTS cut to `budget` from the back (the grazers first, then the lizards, ...)
//   guestSeat(group, k)             { at: [x, z], heading, bearing, out }: where the k-th of `group` sits on the rim, facing the middle
//   KINDS                           each group's critter and its size (world/ardalur/life.js LIFE_SCALE) and its pose clips
//   const guests = createGuests(world, { top, models, budget, ways })
//   guests.ready                    a promise, done once the meshes are made
//   guests.set(group, phase, u)     'away' (not drawn), 'coming' (u 0 to 1 along its way), 'there' (in its seat)
//   guests.update(camera, time)     places and poses everyone shown, for this frame (time: the clock their idle runs on)
//   guests.where()                  [{ group, k, at, heading, shown }]: where each is now (the tests watch them with it)
//   guests.dispose()
//
// A guest's way (`ways[group]`, from hatid-arrival.js: the points its friend comes up by) is made into each member's own: the flyers
// glide in from far out over the sea, the hoppers hop down off a point on Uggeðla's back, the grazers walk up the way behind her
// friend. Members of a group set off a little after one another (STAGGER), so u is the group's, not each one's.
import * as THREE from 'three';
import { createCrowds } from '../world/critters/crowd.js';
import { clipPose } from '../world/critters/crowd-models.js';

export const GUESTS = { flyers: 6, frogs: 5, turtles: 3, lizards: 6, grazers: 3 };
const ORDER = ['flyers', 'frogs', 'turtles', 'lizards', 'grazers'];

/** The critter each group is, its size (life.js LIFE_SCALE), its clip as it sits and as it comes, and how it comes. */
export const KINDS = {
  flyers: { kind: 'flugdyr', scale: 2, idle: 'perch', moving: 'glide', comes: 'fly' },
  frogs: { kind: 'froskur', scale: 4.5, morphs: true, comes: 'hop' },
  turtles: { kind: 'skjaldbaka', scale: 4, morphs: true, comes: 'hop' },
  lizards: { kind: 'smaedla', scale: 2.5, idle: 'idle', moving: 'run', comes: 'hop' },
  grazers: { kind: 'grasbitur', scale: 3, idle: 'graze', moving: 'walk', comes: 'walk' },
};

// Their seats: [first bearing, last bearing, metres out] on the rim behind the dance floor (FLOOR 30 m round the middle), each group by
// the way its friend comes up (hatid-route.js ARRIVALS: Flugeðla -20, Uggeðla 10, Slóeðla 70), clear of every stand and the stage
// (the test holds them to it).
const SEATS = {
  flyers: [-32, -8, 42.5],
  frogs: [-2, 14, 41],
  turtles: [17, 24, 42],
  lizards: [27, 40, 42.5],
  grazers: [51, 64, 41],
};
const STAGGER = 0.08; // of the way: each member sets off this much after the one before
const deg = Math.PI / 180;
const smooth = k => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };

/** GUESTS cut to `budget` from the back. */
export function guestCounts(budget = 23) {
  const counts = { ...GUESTS };
  let over = ORDER.reduce((sum, g) => sum + counts[g], 0) - budget;
  for (let i = ORDER.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(counts[ORDER[i]], over);
    counts[ORDER[i]] -= cut;
    over -= cut;
  }
  return counts;
}

/** Where the k-th of `group` sits on the rim: { at: [x, z], heading (degrees, facing the middle), bearing, out }. */
export function guestSeat(group, k) {
  const [from, to, out] = SEATS[group];
  const n = GUESTS[group];
  const bearing = n > 1 ? from + ((to - from) * k) / (n - 1) : (from + to) / 2;
  const r = out + (k % 2 ? 1.2 : 0); // two rows a little apart
  const at = [Math.cos(bearing * deg) * r, Math.sin(bearing * deg) * r];
  return { at, heading: bearing + 180 + 12 * Math.sin(k * 2.1 + 0.4), bearing, out: r };
}

/**
 * The guests on `top` (a createTop), drawn from `models` (loadCritters'). `ways`: { flyers, hoppers, grazers }, each a function
 * () -> [[x, y, z], ...] giving the group's way now (its friend's: hatid-arrival.js), asked when the group sets off.
 */
export function createGuests(world, { top, models, budget = 23, ways = {} }) {
  const counts = guestCounts(budget);
  const crowds = createCrowds(world, { parent: world.scene, seen: 220, groundAt: (x, z) => top.heightAt(x, z) });
  const members = [];
  for (const group of ORDER) {
    const { kind, scale } = KINDS[group];
    if (!models[kind]) continue;
    for (let k = 0; k < counts[group]; k++) {
      const seat = guestSeat(group, k);
      members.push({
        group, k, kind, scale, model: models[kind], seat, phase: 'away', u: 0, way: null,
        at: new THREE.Vector3(seat.at[0], top.heightAt(...seat.at), seat.at[1]), heading: seat.heading, pitch: 0, shown: false, offset: (k * 0.37) % 1,
      });
    }
  }
  const kinds = new Map();
  for (const m of members) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1);
  for (const [kind, n] of kinds) crowds.reserve(kind, n, models[kind]);
  const ready = Promise.resolve().then(() => crowds.ready());
  const groups = Object.fromEntries(ORDER.map(g => [g, { phase: 'away', u: 0 }]));

  /** A member's own way from its group's: from where the group comes from to its own seat. */
  function wayOf(m) {
    const from = (ways[KINDS[m.group].comes === 'fly' ? 'flyers' : KINDS[m.group].comes === 'hop' ? 'hoppers' : 'grazers'] ?? (() => null))();
    const seat = new THREE.Vector3(m.seat.at[0], top.heightAt(...m.seat.at), m.seat.at[1]);
    if (!from?.length) return [seat.clone(), seat];
    const points = from.map(p => new THREE.Vector3(...p));
    const spread = (m.k - (counts[m.group] - 1) / 2) * 1.4; // side by side, not in one line
    if (KINDS[m.group].comes === 'fly') {
      // in from far out, round over the rim and down onto the seat, each on her own line
      const first = points[0].clone().add(new THREE.Vector3(spread * 3, m.k * 1.5, -spread * 2));
      const high = seat.clone().lerp(first, 0.25).setY(seat.y + 10 + m.k);
      return [first, ...points.slice(1, -1), high, seat];
    }
    if (KINDS[m.group].comes === 'hop') return [points[0].clone().add(new THREE.Vector3(spread * 0.3, 0, spread * 0.3)), seat];
    // the grazers: up her way, each a little to one side, then over to the seat
    return [...points.map(p => p.clone().add(new THREE.Vector3(spread, 0, -spread))), seat];
  }
  const curves = new Map();
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  /** Where member `m` is `k` (0 to 1) along its own way, and which way it goes there. */
  function along(m, k) {
    const points = m.way;
    const how = KINDS[m.group].comes;
    if (how === 'fly') {
      let curve = curves.get(m);
      if (!curve) { curve = new THREE.CatmullRomCurve3(points, false, 'centripetal'); curves.set(m, curve); }
      const e = smooth(k);
      curve.getPointAt(Math.min(1, e), m.at);
      curve.getPointAt(Math.min(1, e + 0.01), w);
      if (w.distanceToSquared(m.at) > 1e-8) {
        m.heading = Math.atan2(w.z - m.at.z, w.x - m.at.x) / deg;
        m.pitch = Math.max(-0.4, Math.min(0.4, Math.atan2(w.y - m.at.y, Math.hypot(w.x - m.at.x, w.z - m.at.z)) * 0.6));
      }
      return;
    }
    if (how === 'hop') {
      // hops down off her back and on to its seat: a few hops, each landing on the ground
      const [a, b] = points;
      const e = smooth(k);
      m.at.lerpVectors(a, b, e);
      const ground = top.heightAt(m.at.x, m.at.z);
      const base = a.y + (ground - a.y) * smooth(k * 4); // off her back in the first quarter
      const hops = 5;
      m.at.y = Math.max(ground, base) + Math.abs(Math.sin(e * hops * Math.PI)) * (m.group === 'frogs' ? 0.9 : 0.4) * (1 - k);
      if (b.distanceToSquared(a) > 1e-6) m.heading = Math.atan2(b.z - a.z, b.x - a.x) / deg;
      return;
    }
    // walking: along the polyline at an even pace, on the ground
    const lengths = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) { const d = points[i].distanceTo(points[i - 1]); lengths.push(d); total += d; }
    let s = smooth(k) * total;
    let i = 0;
    while (i < lengths.length - 1 && s > lengths[i]) { s -= lengths[i]; i++; }
    const t = lengths[i] > 0 ? Math.min(1, s / lengths[i]) : 1;
    m.at.lerpVectors(points[i], points[i + 1], t);
    m.at.y = top.heightAt(m.at.x, m.at.z);
    v.subVectors(points[i + 1], points[i]);
    if (v.lengthSq() > 1e-6) m.heading = Math.atan2(v.z, v.x) / deg;
  }

  function place(m) {
    const group = groups[m.group];
    m.phase = group.phase;
    if (group.phase === 'away') { m.shown = false; return; }
    m.shown = true;
    if (group.phase === 'there') {
      m.at.set(m.seat.at[0], top.heightAt(...m.seat.at), m.seat.at[1]);
      m.heading = m.seat.heading;
      m.pitch = 0;
      m.u = 1;
      return;
    }
    m.way ??= wayOf(m);
    const n = counts[m.group];
    const mine = Math.min(1, Math.max(0, (group.u - m.k * STAGGER) / Math.max(0.2, 1 - (n - 1) * STAGGER)));
    m.u = mine;
    if (mine <= 0 && KINDS[m.group].comes === 'hop') { m.shown = false; return; } // still on her back, under the cloud
    along(m, mine);
    if (mine >= 1) {
      m.heading = m.seat.heading;
      m.pitch = 0;
    }
  }

  function poseOf(m, time) {
    const { model } = m;
    const kind = KINDS[m.group];
    const moving = m.phase === 'coming' && m.u > 0 && m.u < 1;
    if (kind.morphs) {
      // the frogs and turtles have three morphs, no clips: a breath as they sit, a leap or a stretch as they come
      const breathe = 0.5 + 0.5 * Math.sin((time + m.offset * 4) * Math.PI * 2 * 0.6);
      if (m.group === 'frogs') return { morphs: moving ? { leap: 0.8, crouch: 0, breathe: 0 } : { leap: 0, crouch: 0.2, breathe } };
      return { morphs: moving ? { stretch: 0.7, look: 0.3, hide: 0 } : { look: 0.6 * breathe, stretch: 0, hide: 0 } };
    }
    const clip = moving ? kind.moving : kind.idle;
    if (!model.clips?.[clip]) return {};
    const pose = { morphs: clipPose(model, clip, time, m.offset) };
    if (m.group === 'flyers') {
      pose.pitch = m.pitch;
      if (moving && m.u > 0.85) pose.morphs = clipPose(model, 'perch', time, m.offset, null, smooth((m.u - 0.85) / 0.15));
      if (moving) Object.assign(pose.morphs, clipPose(model, 'flap', time, m.offset, null, m.u < 0.15 || m.u > 0.75 ? 0.6 : 0.2));
    }
    return pose;
  }

  let disposed = false;
  return {
    ready,
    counts,
    set(group, phase, u = 0) {
      if (!groups[group]) return;
      groups[group].phase = phase;
      groups[group].u = Math.min(1, Math.max(0, Number(u) || 0));
      if (phase === 'away') for (const m of members) if (m.group === group) { m.way = null; curves.delete(m); }
    },
    phaseOf: group => groups[group]?.phase ?? null,
    update(camera = world.camera, time = 0) {
      if (disposed) return;
      crowds.begin(camera ?? null);
      for (const m of members) {
        place(m);
        if (!m.shown) continue;
        crowds.place(m.kind, m.at, m.heading, m.scale, poseOf(m, time));
      }
      crowds.end();
    },
    where: () => members.map(m => ({ group: m.group, k: m.k, at: m.at, heading: m.heading, shown: m.shown })),
    get calls() { return crowds.calls?.() ?? null; },
    dispose() {
      disposed = true;
      crowds.dispose();
    },
  };
}
