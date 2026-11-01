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
// of 1.5 s in the gorge. Shots change by cuts.
import * as THREE from 'three';
import { BEATS, FALLS } from '../../chapters/kafli4-route.js';

export const FLIGHT_RULES = { roll: 8, minShot: 2.5, quick: { minShot: 1.5, max: 3 }, bound: { dolly: 1.2, pan: 15 }, fixed: { pan: 40 } };
const SLACK = 1.05; // a rule is broken past 5 % over, as the director's are
const BOOST = { degrees: 8, in: 0.4, out: 1 };
const CLEAR = 1.2; // metres the camera keeps over the ground and the water

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

// The fixed shots, placed when they begin from where the flight is then: { position, look(out) }.
const FIXED = {
  // A: from the ground behind the snag as she leaps away from it, looking up
  belowTakeOff: (c) => c.ground(c.route.tree[0] + 9, c.route.tree[2] - 9, 1.7, 55),
  // B, C: low over the water ahead of her, off to one side, as she comes up the river
  waterLevel: (c, { side = 1, lead = 4.5, across = 11 } = {}) => c.overWater(lead, across * side, 0.6, 44),
  // C: on the bank behind an animal group as her shadow goes over it
  bankShadow: (c, { group = 'turtle' } = {}) => {
    const g = c.route.groups.find(x => x.kind === group || x.id === group) ?? c.route.groups[0];
    const r = c.route.river.at(c.route.river.nearest(g.at[0], g.at[2]).d);
    const out = [-r.dir[1] * g.side, r.dir[0] * g.side]; // away from the river, on the group's side
    return c.ground(g.at[0] + out[0] * 14, g.at[2] + out[1] * 14, 2.5, 46);
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
  // D: high in the gorge ahead of her, looking down at them small below
  gorgeHigh: (c, { lead = 6 } = {}) => {
    const s = c.route.distanceAt(Math.min(BEATS.END, c.t + lead));
    const p = c.route.pointAt(s / c.route.length);
    const r = c.route.river.at(c.route.river.nearest(p.x, p.z).d);
    return { position: new V3(r.x, r.level + 26, r.z), fov: 50 };
  },
  // E: out over the plunge pool beside the cliff (inside the bowl's walls), the climb seen from the side, 21 m from it
  fallsSide: (c) => ({ position: new V3(FALLS.face + 22, 26, FALLS.z + 13), fov: 52 }),
  // F: behind and above her as she comes out over the land above the falls
  vista: (c) => {
    const h = rad(c.flier.heading);
    const f = new V3(Math.cos(h), 0, Math.sin(h));
    const right = new V3(-Math.sin(h), 0, Math.cos(h));
    return { position: c.flier.pose.position.clone().addScaledVector(f, -30).addScaledVector(right, 12).add(new V3(0, 12, 0)), fov: 55 };
  },
};

/** The flight camera on `director` for `flier` (engine/flier.js). Options: world (heightAt, the route's water), egill, reduced. */
export function createFlightCamera(director, flier, { world = null, egill = null, reduced = false } = {}) {
  const route = flier.route;
  const shots = Object.freeze([...Object.keys(BOUND), ...Object.keys(FIXED)]);
  const state = { name: null, kind: null, started: null, quick: false, quicks: 0, broken: new Set(), roll: 0, boost: 0, boostTo: 0, last: null };
  const heading = new V3();
  const right = new V3();
  const up = new V3(0, 1, 0);
  const origin = new V3();
  const relative = new V3();
  const lookRel = new V3();
  const prevRel = new V3();
  const prevLook = new V3();
  const dir = new V3();
  let fixed = null; // { position, fov, look }
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

  // What a fixed shot builder may use: the route, the flier, the flight time, and places on the ground or over the water.
  const context = () => ({
    route, flier, t: flier.t ?? 0,
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
  });

  function step(rig, dt) {
    frame();
    const base = bound?.fov ?? fixed?.fov ?? rig.fov;
    // the boost: wider by 8 degrees in 0.4 s, back in 1 s
    const rate = state.boostTo > state.boost ? 1 / BOOST.in : 1 / BOOST.out;
    state.boost = state.boostTo > state.boost ? Math.min(state.boostTo, state.boost + rate * dt) : Math.max(state.boostTo, state.boost - rate * dt);
    rig.fov = base + BOOST.degrees * smooth(state.boost);
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
      rig.position.copy(fixed.position);
      fixed.look(rig.target);
      rig.roll = state.roll = 0;
      dir.copy(rig.target).sub(rig.position).normalize();
      if (dt > 0 && state.last === 'fixed') {
        const pan = deg(dir.angleTo(prevLook)) / dt;
        if (pan > FLIGHT_RULES.fixed.pan * SLACK) once('fixed', `fixed shot "${state.name}" pans ${pan.toFixed(1)} deg/s (max ${FLIGHT_RULES.fixed.pan})`);
      }
      prevLook.copy(dir);
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
   * shot to keep in view instead of her), and the shot's own: a fixed shot's (side, lead, group), or for a bound one `raise` (metres the
   * camera and its look go up together: she holds her head high perched on the snag) and `fov`. Returns the director's handle.
   */
  function shot(name, { quick = false, look = null, raise = 0, fov = null, ...options } = {}) {
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
    orbitAt = 0;
    fixed = null;
    if (!bound) {
      frame();
      const made = FIXED[chosen](context(), options);
      const lookAt = look ?? (out => out.copy(flier.pose.position).add(new V3(0, 0.6, 0)));
      fixed = { position: made.position, fov: made.fov, look: lookAt };
    }
    const handle = director.drive(`flight ${name}`, step);
    step(director.rig, 0);
    director.apply();
    return handle;
  }

  return {
    shots, rules: FLIGHT_RULES,
    get current() { return state.name; },
    get roll() { return state.roll; },
    get fov() { return director.rig.fov; },
    shot,
    /** „Hraðar!“: the lens widens 8 degrees over 0.4 s, and back over 1 s. */
    boost(on) { state.boostTo = on ? 1 : 0; },
    /** One frame without the director (a test); the director calls the same step each frame while a flight shot is its mode. */
    update(dt) { step(director.rig, dt); director.apply(); },
    /** The flight is over: the last shot's length is checked. */
    stop() { endShot(); state.name = null; bound = null; fixed = null; },
  };
}
