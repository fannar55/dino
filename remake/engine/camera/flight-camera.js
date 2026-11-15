// The flight camera (chapter 4, spec section 5): named shots of Flugeðla flying with Egill on her back, on top of the director.
//
//   const camera = createFlightCamera(director, flier, { world, egill });
//   yield camera.shot('chase');                     // bound to her: behind and above Egill's shoulder
//   yield camera.shot('waterLevel', { side: -1 });  // fixed: low over the water ahead of her, tracking her as she comes
//
// Two kinds of shot. A bound shot rides with her: its offset is in her own frame seen from above (her heading, not her bank or her
// climb), so it never swings with her roll, and it may lean a third of her bank (at most 8 degrees: no travel sickness, spec 5).
// A fixed shot stands still, placed through the route when it begins (on the bank, by the falls, high in the gorge) and turns to keep
// her in view. The director's own moves are linted against STYLE.md section 8; these are linted here, against FLIGHT_RULES, into
// director.warnings as `flight: ...`. A bound shot breaks the rules when its offset moves faster than 1.2 m/s or its look turns faster
// than 15 deg/s relative to her; a fixed one when it pans faster than 40 deg/s; any shot shorter than 2.5 s, except three quick ones
// of 1.5 s in the gorge. Shots change by cuts. One fixed shot moves, the run-along (C): it stands on a moving stand, a still camera's
// rules but for its speed (FLIGHT_RULES.track: 7 m/s at most, and its pan 40 deg/s), and under reduced motion it stands still.
import * as THREE from 'three';
import { BEATS, FALLS, STILLS, CALL_SHOTS, NESTS } from '../../chapters/kafli4-route.js';

export const FLIGHT_RULES = { roll: 8, minShot: 2.5, quick: { minShot: 1.5, max: 3 }, bound: { dolly: 1.2, pan: 15 }, fixed: { pan: 40 }, track: { speed: 7, pan: 40 } };
const EASE = 0.5; // seconds the run-along's stand takes to come up to its speed, and to come to a stop
const HERD_MIDDLE = 1.5; // metres over the ground a grazer's middle is (the owner's grazer is 2.9 m tall: life.js)
const SLACK = 1.05; // a rule is broken past 5 % over, as the director's are
// The lens with her speed (the juice review's item 14): in the chase, wider by up to `degrees` as she goes from `from` to `to` m/s,
// the lens moving `rate` degrees a second at most (the zoom rule is 8); none under reduced motion.
const SPEED_LENS = { degrees: 2.5, from: 16, to: 22, rate: 3 };
export const CLEAR = 1.2; // metres the camera keeps over the ground and the water

const V3 = THREE.Vector3;
const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const smooth = x => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const inOut = x => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));

// The bound shots: offsets [ahead, up, right] in metres in her frame seen from above, from Egill's head or her body.
const BOUND = {
  chase: { origin: 'egill', offset: [-6.5, 2.4, 0], look: { origin: 'egill', at: [12, -2.6, 0] }, fov: 50 },
  face: { origin: 'egill', offset: [2.2, 0.6, -1.6], look: { origin: 'egill', at: [0.3, -0.45, 0] }, fov: 42 },
  side: { origin: 'body', offset: [0, 0.8, 7], look: { origin: 'body', at: [0.6, 0.6, 0] }, fov: 46 },
  // a slow circle round them (spec 5F): from behind on her right round to her front right, 100 degrees in 16 s at 6.8 m
  orbit: { origin: 'body', radius: 6.8, height: 1.6, from: 160, to: 60, seconds: 16, look: { origin: 'body', at: [0, 0.8, 0] }, fov: 48 },
};

const MOSI_HEAD = 1.5; // metres over the water his head is as he runs in the shallows (the lines of sight of mosiBank)

/**
 * An animal group of the route by id or kind (the first if none), and its middle: 0.3 m over the ground or the water, or where the
 * group is when that is higher (the birds in their tree's crown, the dragonflies over the water).
 */
function groupOf(route, group) {
  return route.groups.find(x => x.id === group || x.kind === group) ?? route.groups[0];
}
function groupMiddle(route, group, groundAt) {
  const g = groupOf(route, group);
  return new V3(g.at[0], Math.max(groundAt(g.at[0], g.at[2]) + 0.3, g.at[1]), g.at[2]);
}
/** A call shot's row (the route's CALL_SHOTS) by its id. */
function callRow(id) {
  const row = CALL_SHOTS.find(r => r.id === id);
  if (!row) throw new Error(`No call shot named "${id}" (there are ${CALL_SHOTS.map(r => r.id).join(', ')})`);
  return row;
}
/** Where she is at flight second t, unsteered (the route's schedule). */
const herAt = (route, t) => route.pointAt(route.progressAt(t));
/**
 * The run-along's stand: from a to b (seen from above) between flight seconds t0 and t1 at a steady speed, eased over its first and
 * last EASE seconds (its speed rises and falls in a straight line), `above` the ground. Returns at(t, out) and its top speed.
 */
function standAlong(a, b, t0, t1, above, groundAt) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const span = t1 - t0;
  const speed = length / (span - EASE);
  const gone = k => (k < EASE ? (speed * k * k) / (2 * EASE) : k > span - EASE ? length - (speed * (span - k) ** 2) / (2 * EASE) : speed * (k - EASE / 2));
  return {
    speed,
    at(t, out = new V3()) {
      const share = length > 0 ? gone(clamp(t - t0, 0, span)) / length : 0;
      const x = a[0] + (b[0] - a[0]) * share;
      const z = a[1] + (b[1] - a[1]) * share;
      return out.set(x, groundAt(x, z) + above, z);
    },
  };
}
/** Away from the river, on the group's side, seen from above. */
function groupOut(route, group) {
  const g = groupOf(route, group);
  const r = route.river.at(route.river.nearest(g.at[0], g.at[2]).d);
  return [-r.dir[1] * g.side, r.dir[0] * g.side];
}

// The fixed shots, placed when they begin from where the flight is then: { position, look(out) }.
const FIXED = {
  // A: from the ground behind the snag as she leaps away from it, looking up
  belowTakeOff: (c) => c.ground(c.route.tree[0] + 9, c.route.tree[2] - 9, 1.7, 55),
  // B, C: low over the water ahead of her, off to one side, as she comes up the river
  waterLevel: (c, { side = 1, lead = 4.5, across = 11 } = {}) => c.overWater(lead, across * side, 0.6, 44),
  // C: a call shot (the route's CALL_SHOTS, by `callShot`): down with an animal group, `back` metres behind its middle away from the
  // river, `above` over the ground or the water (never under CLEAR) and `aside` along the bank up the river, so the group fills the
  // near frame and the way she comes is behind it. It aims at a point `look` of the way from the group's middle to where she passes
  // (its `pass`) and holds it: she sweeps through a still frame (the Flugmynd spec: the group at least 8 % of the frame's height).
  call: (c, { callShot = null, group = null, pass = null, back = 6, above = CLEAR, aside = 0, fov = 44, look = 0.5 } = {}) => {
    const row = callShot ? callRow(callShot) : null;
    const id = group ?? row?.group;
    const middle = groupMiddle(c.route, id, c.groundAt);
    const out = groupOut(c.route, id); // away from the river, on the group's side
    const g = groupOf(c.route, id);
    const r = c.route.river.at(c.route.river.nearest(g.at[0], g.at[2]).d);
    const made = c.ground(middle.x + out[0] * back + r.dir[0] * aside, middle.z + out[1] * back + r.dir[1] * aside, Math.max(above, CLEAR), fov);
    const aim = middle.clone().lerp(c.route.pointAt(c.route.progressAt(pass ?? row?.pass ?? c.t)), look);
    return { ...made, middle, group: g.id, look: target => target.copy(aim) };
  },
  // C: the run-along (the route's CALL_SHOTS row 4): on a stand moving along `path` ([x, z] to [x, z]) from the row's `from` to its
  // `to` (still till `move`), `above` the ground (never under CLEAR), beside lizards running up the bank; it looks the one way all through, as it
  // looks from where it starts at a point `look` of the way from `group`'s middle to her pass, so its frame goes along with them and
  // never pans. Under reduced motion it stands still at the path's middle (createFlightCamera).
  runAlong: (c, { callShot = null, path = null, from = null, move = null, to = null, group = null, pass = null, above = CLEAR, fov = 48, look = 0.3 } = {}) => {
    const row = callShot ? callRow(callShot) : null;
    const [a, b] = path ?? row.options.path;
    const t0 = from ?? row?.from ?? c.t;
    const t1 = to ?? row?.to ?? t0 + 5;
    const track = standAlong(a, b, move ?? t0, t1, Math.max(above, CLEAR), c.groundAt); // still till `move`, when the lizards run
    const aimFrom = groupMiddle(c.route, group ?? row?.group, c.groundAt); // the group it aims from
    const position = track.at(t0);
    const ahead = aimFrom.clone().lerp(herAt(c.route, pass ?? row?.pass ?? c.t), look).sub(position);
    const ids = row ? [row.group, ...(row.also ?? [])] : [group];
    return {
      position, fov, middle: groupMiddle(c.route, ids[0], c.groundAt), seen: ids.map(id => groupMiddle(c.route, id, c.groundAt)), group: groupOf(c.route, ids[0]).id, ahead,
      track: { ...track, middle: ((move ?? t0) + t1) / 2, from: t0, to: t1 },
    };
  },
  // C: across the river from Mosi running in the shallows (route.cameos.bank)
  mosiBank: (c) => {
    const [x, z] = c.route.cameos.bank.path[2];
    const near = c.route.river.nearest(x, z);
    const r = c.route.river.at(near.d);
    const across = r.half + 16;
    return c.ground(r.x - r.dir[1] * across, r.z + r.dir[0] * across, 1.8, 50); // the north bank
  },
  // D: high over the gorge's north rim just behind where Mosi starts (route.cameos.rim), looking down the gorge: he runs away along the
  // rim and she flies up the gorge below him. Only from high up does the camera see over the rim's edge down to her (lower, the rock
  // hides her); the chapter aims it between the two of them (its `look`).
  mosiRim: (c) => {
    const [x, z] = c.route.cameos.rim.path[0];
    const r = c.route.river.at(c.route.river.nearest(x, z).d + 2);
    const out = r.half + 18; // 2 m further back from the edge than his path
    return c.ground(r.x - r.dir[1] * out, r.z + r.dir[0] * out, 30, 56);
  },
  // D: on the ledge beside a flyer's nest (the route's CALL_SHOTS row 5, NESTS[`nest`]): `along` metres up the river from it, `out`
  // toward the river's middle and `above` it (never under CLEAR over the ground there), looking down the gorge the way she comes, at a
  // point `look` of the way from the nest to her at the row's call (the flyer leaves then: world/ardalur/life.js, she 25 m off)
  ledge: (c, { callShot = null, nest = null, along = 8, out = 1.5, above = 2, look = 0.3, fov = 46 } = {}) => {
    const row = callShot ? callRow(callShot) : null;
    const [x, y, z] = NESTS[nest ?? row.nest];
    const r = c.route.river.at(c.route.river.nearest(x, z).d);
    const inward = new THREE.Vector2(r.x - x, r.z - z).normalize();
    const px = x + r.dir[0] * along + inward.x * out;
    const pz = z + r.dir[1] * along + inward.y * out;
    const position = new V3(px, Math.max(y + above, c.groundAt(px, pz) + CLEAR), pz);
    const middle = new V3(x, y, z);
    const aim = middle.clone().lerp(herAt(c.route, row?.call ?? c.t), look);
    return { position, fov, middle, group: null, look: target => target.copy(aim) };
  },
  // F: down among a group of the herd (the route's CALL_SHOTS row 6, at `at`: life.js HERD) as the big call comes, `back` metres from
  // its middle away from where she passes it (seen from above) and `side` to the right of that, `above` the ground; it looks up at a
  // point `look` of the way from the group's middle (HERD_MIDDLE over the ground) to her at the row's pass
  herd: (c, { callShot = null, at = null, pass = null, back = 16, side = 0, above = CLEAR, look = 0.45, fov = 50 } = {}) => {
    const row = callShot ? callRow(callShot) : null;
    const [hx, hz] = at ?? row.at;
    const her = herAt(c.route, pass ?? row?.pass ?? c.t);
    const away = new THREE.Vector2(hx - her.x, hz - her.z).normalize();
    const made = c.ground(hx + away.x * back - away.y * side, hz + away.y * back + away.x * side, Math.max(above, CLEAR), fov);
    const middle = new V3(hx, c.groundAt(hx, hz) + HERD_MIDDLE, hz);
    const aim = middle.clone().lerp(her, look);
    return { ...made, middle, group: null, look: target => target.copy(aim) };
  },
  // E: out over the plunge pool beside the cliff (inside the bowl's walls), the climb seen from the side, 21 m from it; under the
  // chapter's sun (earlyAfternoon, 215/22, over the cliff) it looks toward the sun through the spray
  fallsSide: (c) => ({ position: new V3(FALLS.face + 22, 26, FALLS.z + 13), fov: 52 }),
  // E: the last of the climb from above the lip, 7 m back from the edge and 22 m to its north, 18 m over it (high enough to see past
  // the bowl's north rim down the face): she comes up the falling water toward the camera, which looks down it and away from the sun,
  // so the rainbow in the sunlit spray over the lip is in view (world/props/waterfall.js: within 40 degrees of straight away from the
  // sun, the bow at 41). Close in, so the falls, the spray and the bow fill the frame.
  fallsTop: () => ({ position: new V3(FALLS.face - 7, FALLS.top + 18, FALLS.z - 22), fov: 38 }),
  // F: behind and a little above her as she comes out over the land above the falls, looking over her (4 m above her body), so the
  // land runs to the mountains in the upper third and Grameðla's shadow on their ridge is in the frame (world/ardalur/far-land.js)
  vista: (c) => {
    const h = rad(c.flier.heading);
    const f = new V3(Math.cos(h), 0, Math.sin(h));
    const right = new V3(-Math.sin(h), 0, Math.cos(h));
    return {
      position: c.flier.pose.position.clone().addScaledVector(f, -30).addScaledVector(right, 12).add(new V3(0, 7, 0)), fov: 55,
      look: out => out.copy(c.flier.pose.position).add(new V3(0, 4, 0)),
    };
  },
};

/** What a fixed shot builder may use: the route, the flier, the flight time, the ground, and places on the ground or over the water. */
function fixedContext(route, flier, groundAt) {
  return {
    route, flier, t: flier.t ?? 0, groundAt,
    ground(x, z, above, fov) { return { position: new V3(x, groundAt(x, z) + above, z), fov }; },
    overWater(lead, across, above, fov) {
      const s = route.distanceAt(Math.min(BEATS.END, (flier.t ?? 0) + lead));
      const u = s / route.length;
      const p = route.pointAt(u);
      const tan = route.tangentAt(u);
      const side = new V3(-tan.z, 0, tan.x).normalize();
      const x = p.x + side.x * across;
      const z = p.z + side.z * across;
      return { position: new V3(x, groundAt(x, z) + above, z), fov };
    },
  };
}

/**
 * Each still shot of the flight (the route's STILLS) as the unattended flight has it: where its camera stands (the FIXED builder at the
 * shot's first second, her unsteered) and what it looks at: her body every 0.5 s of the shot, Mosi's head along his path for mosiBank,
 * the group's middle for a call shot (the nest for the ledge, the herd's middle for the herd). The valley keeps its plants out of these
 * views (world/ardalur/banks.js). The run-along is a view from each second of its stand's way, and from its end.
 * Returns [{ shot, from, to, position, looks, group }] (group: a call shot's group id, else null), the run-along's first from its start.
 */
export function stillViews(route, { heightAt = () => 0 } = {}) {
  const groundAt = (x, z) => Math.max(heightAt(x, z), route.waterAt(x, z, 1) ?? -Infinity);
  return STILLS.flatMap(([shot, from, to, options]) => {
    const u = route.progressAt(from);
    const tan = route.tangentAt(u);
    const flier = { t: from, heading: deg(Math.atan2(tan.z, tan.x)), pose: { position: route.pointAt(u) } };
    const made = FIXED[shot](fixedContext(route, flier, groundAt), options);
    const looks = [];
    for (let t = from; t <= to + 1e-9; t += 0.5) looks.push(route.pointAt(route.progressAt(t)));
    if (shot === 'mosiBank') for (const [x, z] of route.cameos.bank.path) looks.push(new V3(x, (route.waterAt(x, z, 2) ?? heightAt(x, z)) + MOSI_HEAD, z));
    for (const m of made.seen ?? (made.middle ? [made.middle] : [])) looks.push(m.clone());
    const places = made.track ? [...Array.from({ length: Math.floor(to - from + 1e-9) + 1 }, (_, k) => made.track.at(from + k)), made.track.at(to)] : [made.position];
    return places.map(position => ({ shot, from, to, position, looks, group: made.group ?? null }));
  });
}

/** The flight camera on `director` for `flier` (engine/flier.js). Options: world (heightAt, the route's water), egill, reduced. */
export function createFlightCamera(director, flier, { world = null, egill = null, reduced = false } = {}) {
  const route = flier.route;
  const shots = Object.freeze([...Object.keys(BOUND), ...Object.keys(FIXED)]);
  const state = { name: null, kind: null, started: null, quick: false, quicks: 0, broken: new Set(), roll: 0, last: null, fast: 0 };
  const heading = new V3();
  const right = new V3();
  const up = new V3(0, 1, 0);
  const origin = new V3();
  const relative = new V3();
  const lookRel = new V3();
  const prevRel = new V3();
  const prevLook = new V3();
  const prevPosition = new V3();
  const dir = new V3();
  let fixed = null; // { position, fov, look, track: the run-along's moving stand or null }
  let bound = null;
  let orbitAt = 0;

  const warn = message => director.warnings.push({ time: Number(director.time.toFixed(2)), message: `flight: ${message}` });
  const once = (key, message) => { if (!state.broken.has(key)) { state.broken.add(key); warn(message); } };
  const groundAt = (x, z) => Math.max(world?.heightAt?.(x, z) ?? -Infinity, route.waterAt(x, z, 1) ?? -Infinity);

  function frame() {
    const h = rad(flier.heading);
    heading.set(Math.cos(h), 0, Math.sin(h));
    right.set(-Math.sin(h), 0, Math.cos(h));
  }
  function originOf(name, out) {
    if (name === 'egill' && egill) return egill.headPosition(out);
    return out.copy(flier.pose.position);
  }
  const inFrame = ([a, u, r], out) => out.set(0, 0, 0).addScaledVector(heading, a).addScaledVector(up, u).addScaledVector(right, r);
  const toFrame = (v, out) => out.set(v.dot(heading), v.y, v.dot(right));

  const context = () => fixedContext(route, flier, groundAt);

  function step(rig, dt) {
    frame();
    const base = bound?.fov ?? fixed?.fov ?? rig.fov;
    // the chase a little wider the faster she goes, easing at the lens's own pace (at once on a cut: a new shot's lens)
    const fast = !reduced && state.name === 'chase' ? SPEED_LENS.degrees * smooth((flier.speed - SPEED_LENS.from) / (SPEED_LENS.to - SPEED_LENS.from)) : 0;
    state.fast = dt > 0 ? state.fast + clamp(fast - state.fast, -SPEED_LENS.rate * dt, SPEED_LENS.rate * dt) : fast;
    rig.fov = base + state.fast;
    if (bound) {
      let offset;
      if (bound.radius) {
        orbitAt += dt;
        const a = rad(bound.from + (bound.to - bound.from) * inOut(orbitAt / bound.seconds));
        offset = [Math.cos(a) * bound.radius, bound.height, Math.sin(a) * bound.radius];
      } else offset = bound.offset;
      originOf(bound.origin, origin);
      rig.position.copy(origin).add(inFrame(offset, relative));
      originOf(bound.look.origin, rig.target).add(inFrame(bound.look.at, dir));
      const floor = groundAt(rig.position.x, rig.position.z) + CLEAR;
      if (rig.position.y < floor) rig.position.y = floor;
      // her bank, a third of it, leaning the way she leans as the camera sees her
      const facing = dir.copy(rig.target).sub(rig.position).setY(0).normalize().dot(heading);
      const share = reduced ? 0.5 : 1;
      state.roll = clamp((flier.bank / 3) * facing * share, -FLIGHT_RULES.roll, FLIGHT_RULES.roll);
      rig.roll = state.roll;
      // lint: the offset and the look relative to her
      toFrame(relative.copy(rig.position).sub(origin), relative);
      toFrame(lookRel.copy(rig.target).sub(rig.position).normalize(), lookRel);
      if (dt > 0 && state.last === 'bound') {
        const speed = relative.distanceTo(prevRel) / dt;
        const turn = deg(lookRel.angleTo(prevLook)) / dt;
        if (speed > FLIGHT_RULES.bound.dolly * SLACK) once('dolly', `shot "${state.name}" moves ${speed.toFixed(2)} m/s relative to her (max ${FLIGHT_RULES.bound.dolly})`);
        if (turn > FLIGHT_RULES.bound.pan * SLACK) once('pan', `shot "${state.name}" turns ${turn.toFixed(1)} deg/s relative to her (max ${FLIGHT_RULES.bound.pan})`);
      }
      prevRel.copy(relative);
      prevLook.copy(lookRel);
      state.last = 'bound';
    } else if (fixed) {
      if (fixed.track) fixed.track.at(flier.t ?? 0, fixed.position); // the run-along's stand, where it is at this second of the flight
      rig.position.copy(fixed.position);
      fixed.look(rig.target);
      rig.roll = state.roll = 0;
      dir.copy(rig.target).sub(rig.position).normalize();
      if (dt > 0 && state.last === 'fixed') {
        const pan = deg(dir.angleTo(prevLook)) / dt;
        const most = fixed.track ? FLIGHT_RULES.track.pan : FLIGHT_RULES.fixed.pan;
        if (pan > most * SLACK) once('fixed', `${fixed.track ? 'moving' : 'fixed'} shot "${state.name}" pans ${pan.toFixed(1)} deg/s (max ${most})`);
        const speed = rig.position.distanceTo(prevPosition) / dt;
        if (fixed.track && speed > FLIGHT_RULES.track.speed * SLACK) once('track', `moving shot "${state.name}" goes ${speed.toFixed(2)} m/s (max ${FLIGHT_RULES.track.speed})`);
      }
      prevLook.copy(dir);
      prevPosition.copy(rig.position);
      state.last = 'fixed';
    }
  }

  // The length of the shot that is ending.
  function endShot() {
    if (state.name === null) return;
    const length = director.time - state.started;
    const least = state.quick ? FLIGHT_RULES.quick.minShot : FLIGHT_RULES.minShot;
    if (length < least - 1e-6) warn(`shot "${state.name}" lasted ${length.toFixed(2)} s (min ${least} s${state.quick ? ' for a quick one' : ''})`);
  }

  /**
   * Cut to a named shot. Options: quick (one of the three 1.5 s shots of the gorge), look (a point spec function out => out for a fixed
   * shot to keep in view instead of her), and the shot's own: a fixed shot's (side, lead; a call shot's callShot, back, above, aside,
   * its `fov` and its `look` as a share), or for a bound one `raise` (metres the camera and its look go up together: she holds her head
   * high perched on the snag) and `fov`, and for the orbit `seconds`: a shorter circle at its own pace that ends where the whole one
   * ends (its last part). Returns the director's handle.
   */
  function shot(name, { quick = false, look = null, raise = 0, fov = null, seconds = null, ...options } = {}) {
    // a number for `look`, and a `fov`, are a fixed shot's own (the call shot's): they go to its builder
    if (typeof look === 'number') { options.look = look; look = null; }
    if (fov !== null && FIXED[name]) options.fov = fov;
    if (!BOUND[name] && !FIXED[name]) throw new Error(`No flight shot named "${name}" (there are ${shots.join(', ')})`);
    endShot();
    if (quick && ++state.quicks > FLIGHT_RULES.quick.max) warn(`shot "${name}" is quick shot number ${state.quicks} (at most ${FLIGHT_RULES.quick.max})`);
    let chosen = name;
    if (reduced && name === 'orbit') chosen = 'vista'; // reduced motion: no circling (Review Focus 5)
    state.name = name;
    state.started = director.time;
    state.quick = quick;
    state.broken = new Set();
    state.last = null;
    bound = BOUND[chosen] ?? null;
    if (bound && !bound.radius && (raise || fov)) {
      const [ahead, up, right] = bound.offset;
      const [lookAhead, lookUp, lookRight] = bound.look.at;
      bound = { ...bound, offset: [ahead, up + raise, right], look: { ...bound.look, at: [lookAhead, lookUp + raise, lookRight] }, fov: fov ?? bound.fov };
    }
    if (bound?.radius && seconds !== null) {
      const share = clamp(seconds / bound.seconds, 0, 1);
      bound = { ...bound, from: bound.to + (bound.from - bound.to) * share, seconds: Math.max(1e-3, bound.seconds * share) };
    }
    orbitAt = 0;
    fixed = null;
    if (!bound) {
      frame();
      const made = FIXED[chosen](context(), options);
      // the run-along: on its moving stand, looking its one way; under reduced motion still, at its path's middle
      const track = made.track && !reduced ? made.track : null;
      const position = made.track && reduced ? made.track.at(made.track.middle) : made.position.clone();
      const ahead = made.ahead ?? null;
      const lookAt = look ?? made.look ?? (ahead ? out => out.copy(fixed.position).add(ahead) : out => out.copy(flier.pose.position).add(new V3(0, 0.6, 0)));
      fixed = { position, fov: made.fov, look: lookAt, track };
    }
    const handle = director.drive(`flight ${name}`, step);
    step(director.rig, 0);
    director.apply();
    for (const fn of [...cutListeners]) fn(name);
    return handle;
  }
  const cutListeners = [];

  return {
    shots, rules: FLIGHT_RULES,
    get current() { return state.name; },
    get roll() { return state.roll; },
    get fov() { return director.rig.fov; },
    /** Degrees the chase is wider now for her speed (SPEED_LENS). */
    get speedLens() { return state.fast; },
    shot,
    /** Hear every cut, with the shot's name, as it is made. Returns the off. */
    onCut(fn) {
      cutListeners.push(fn);
      return () => { const i = cutListeners.indexOf(fn); if (i >= 0) cutListeners.splice(i, 1); };
    },
    /** One frame without the director (a test); the director calls the same step each frame while a flight shot is its mode. */
    update(dt) { step(director.rig, dt); director.apply(); },
    /** The flight is over: the last shot's length is checked. */
    stop() { endShot(); state.name = null; bound = null; fixed = null; },
  };
}
