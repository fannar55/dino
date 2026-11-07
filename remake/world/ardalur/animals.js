// The animal groups on the banks of C (the life spec, 2026-11-05, section 3), one after another as she flies up the river: nine
// groups about 5 s apart, frogs on lily pads, small lizards drinking at the edge, birds in a tree by the water, turtles on a stone
// and a log, dragonflies over the water. When she calls, a group answers her, once: the frogs jump (and croak: the chapter's sound),
// the small lizards squeak and run along the bank with her for 5 s, the birds fly up out of their tree and away, the turtles stretch
// their necks, the dragonflies follow her in a swarm for 4 s. Where a frog lands in the river, and where a turtle slides into it,
// the water splashes (world/props/splash.js; the juice review of 2026-11-07).
//
// They are the game's own critters (world/critters/models.js: at most 400 triangles each), drawn larger than life (SCALE) so that
// they read from the air, and drawn as crowds (world/critters/crowd.js): each kind in one draw call however many there are. The small
// lizards are the owner's own model (assets/critters/smaedla.glb, baked by tools/prep-crowd.mjs: its clips in morph frames, two
// levels of detail) when the chapter has loaded it (loadCritters); the Fen's salamander stands in without it. At rest the row at
// the edge drinks and the row behind stands about, they look up at her as she passes over, and run with her when they answer.
//
//   const critters = await loadCritters(world);                                    // { smaedla, grasbitur } (crowd-models.js), those that can be had
//   const animals = createAnimals(world, route, { heightAt, library, crowds, critters }); // library: the forest's species (prop sizes)
//   animals.crowds                         what draws them (shared with the flight's other life when given; their own otherwise)
//   animals.group                          the crowds' group (in world.scene unless the crowds were given)
//   animals.props                          what they sit on: [{ name, variant, x, y, z, rot, scale }] for the plants to grow (banks.js)
//   animals.clear                          [{ x, z, r }]: round each critter and prop, where no other plant may grow
//   animals.groups                         [{ id, kind, point, radius, members, answered, answer() -> Handle }], in the order she meets them
//   animals.update(dt, t)                  each frame, on the game clock (t): their life and their answers, placed in the crowds
//   animals.dispose()
//
// A member is a record: { kind, home, heading, position, morphs, visible, height, along, e, d, side, phase }, its pose at the last
// update. Given crowds are begun and ended by their owner (index.js) round update; their own, update begins and ends itself.
//
// An answer is a function of the game clock: a capture or a seek that jumps to a time finds them where playing would have. The
// dragonflies follow her where she is now (world.flightPoint, or route.pointAt(world.flightU)); once they let her go they are out of
// sight until they are home again. answer() a second time is a finished Handle: a group answers once.
import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { DONE, Handle } from '../../engine/handle.js';
import { clipPose, crowdModelFrom } from '../critters/crowd-models.js';
import { createModel } from '../critters/models.js';
import { createCrowds } from '../critters/crowd.js';
import { splash } from '../props/splash.js';

/** How much larger than life each critter is drawn: they are seen from her back, 5 m up and 10 to 15 m off, at 14 to 16 m/s (and
 * on an upright tablet too, where the same view is 800 px wide, not 1280: kafli4's chase test). */
export const SCALE = { frog: 4.5, dragonfly: 5, turtle: 4.5, salamander: 4, smaedla: 1.5, bird: 7 };
const MEMBER = { frogs: 'frog', birds: 'bird', dragonflies: 'dragonfly', turtle: 'turtle', lizards: 'salamander' };

/** The owner's small lizard (his Tripo3D model, 0.8 m long at scale 1), as tools/prep-crowd.mjs bakes it. */
export const SMAEDLA_MODEL = new URL('../../assets/critters/smaedla.glb', import.meta.url).href;
/** The owner's grazer (his Tripo3D model, 2.5 m long at scale 1), as tools/prep-crowd.mjs bakes it: walk, trot, graze, look. */
export const GRASBITUR_MODEL = new URL('../../assets/critters/grasbitur.glb', import.meta.url).href;
/** The owner's flyer (his Tripo3D model, 0.77 m beak to tail and 1.19 m across its wings at scale 1): flap, glide, perch. */
export const FLUGDYR_MODEL = new URL('../../assets/critters/flugdyr.glb', import.meta.url).href;
const critterFiles = new Map(); // url -> the page's load of it, once however many valleys are built
/**
 * The valley's baked critters: { smaedla, grasbitur, flugdyr } as crowd models (world/critters/crowd-models.js), read through
 * world.loadModel (the tests read the file) or three's loader (the page), side by side. One that cannot be had is left out and the
 * chapter goes on: without the small lizard the salamander stands in, without the grazer there is no herd, without the flyer no
 * flyers (life.js).
 */
export async function loadCritters(world) {
  const files = [
    ['smaedla', SMAEDLA_MODEL, 'the salamander stands in'], ['grasbitur', GRASBITUR_MODEL, 'there is no herd'],
    ['flugdyr', FLUGDYR_MODEL, 'there are no flyers'],
  ];
  const loaded = await Promise.all(files.map(async ([name, url, without]) => {
    try {
      let gltf;
      if (world.loadModel) gltf = await world.loadModel(url);
      else {
        if (!critterFiles.has(url)) critterFiles.set(url, new GLTFLoader().loadAsync(url));
        gltf = await critterFiles.get(url);
      }
      return [name, crowdModelFrom(gltf)];
    } catch (error) {
      critterFiles.delete(url);
      console.warn(`[animals] ${name} could not be loaded; ${without}:`, error?.message ?? error);
      return null;
    }
  }));
  return Object.fromEntries(loaded.filter(Boolean));
}
// The small lizard looks up at her as she passes over: fully within `near` metres of her (seen from above), not at all beyond
// `near` + `fade`; its look clip from its first frame to `frame`, the head up.
const LOOK = { near: 16, fade: 10, frame: 5 };
/** How long each group's answer lasts, in seconds: then it is on its way to the festival, out of sight (the dragonflies home again). */
export const ANSWER = { frogs: 7, lizards: 9, birds: 8, turtle: 4, dragonflies: 10 };
/** The kinds whose answer's last pose is their rest from then on (gone): all but the dragonflies, which come home. */
const STAY = new Set(['frogs', 'lizards', 'birds', 'turtle']);
const RADIUS = 4; // metres: a group's tap target, wide (spec 6)
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = k => Math.min(1, Math.max(0, k));
const smooth = k => { const x = clamp01(k); return x * x * (3 - 2 * x); };
/** 0 → 1 over `rise` seconds, 1 until `hold` more, 1 → 0 over `fall`: the shape of an answer that comes back to rest. */
const envelope = (tau, rise, hold, fall) => (tau < rise ? smooth(tau / rise) : tau < rise + hold ? 1 : 1 - smooth((tau - rise - hold) / fall));

// Where each member of a group sits: `along` metres up the river from the group's place, `e` metres from the water's edge (less
// than 0 over the water), `up` metres over the water (dragonflies), `on` the prop it sits on.
const LAYOUT = {
  frogs: [-3.6, -2.2, -0.7, 0.8, 2.3, 3.7].map((along, i) => ({ along, e: [-0.6, -0.9, -0.7, -0.95, -0.6, -0.85][i], on: i })),
  lizards: [
    // a row drinking at the edge, and a row on the bank behind it
    { along: -3.8, e: 0.35 }, { along: -1.9, e: 0.3 }, { along: 0, e: 0.4 }, { along: 1.9, e: 0.3 }, { along: 3.8, e: 0.35 },
    { along: -3.0, e: 2.4 }, { along: -1.0, e: 3.0 }, { along: 1.0, e: 2.6 }, { along: 3.0, e: 3.2 }, { along: 0.1, e: 4.2 },
  ],
  turtle: [{ along: -2.25, e: 1.1, on: 0 }, { along: 1.5, e: 1.6, on: 1 }, { along: 3.45, e: 1.6, on: 1 }],
  dragonflies: [
    { along: -2.4, e: -3.2, up: 1.0 }, { along: -1.0, e: -2.4, up: 1.6 }, { along: 0.3, e: -3.6, up: 1.2 },
    { along: 1.4, e: -2.8, up: 0.9 }, { along: 2.6, e: -3.4, up: 1.5 }, { along: 3.8, e: -2.6, up: 1.3 },
  ],
  // in the crown of their tree, on the side that faces the river: [turn from facing the river (radians), height in the crown (a
  // share of its half-height)]
  birds: [[-1.1, 0.35], [-0.85, -0.1], [-0.6, 0.15], [-0.35, 0.5], [-0.1, -0.2], [0.1, 0.25], [0.35, 0.05], [0.6, 0.4], [0.85, -0.05], [1.1, 0.3]],
};
// What they sit on (forest species, world/forest/species.js), placed the same way.
const PROPS = {
  // small pads hugging the bank, 3 m clear of her lane at its widest steer where the river is narrowest (d 470)
  frogs: LAYOUT.frogs.map((m, i) => ({ name: 'waterLily', variant: i % 6, along: m.along, e: m.e, scale: 2.2 })),
  turtle: [{ name: 'rock', variant: 1, along: -2.25, e: 1.1, scale: 1.5 }, { name: 'log', variant: 0, along: 2.5, e: 1.6, scale: 1.4, lengthwise: true }],
  birds: [{ name: 'broadleaf', along: 0, e: 7, scale: 0.65 }], // its variant: which of the groups of birds it is
};
const CLEAR = { log: 2.2, rock: 1.2, broadleaf: 2.0 }; // metres round a prop where nothing else grows (else 0.9)
const LILY_TOP = 0.03; // metres a frog sits over the water on its pad
const DEFAULT_TOP = { log: 0.45, rock: 0.55 }; // a prop's top when there is no species library to measure it
/** A broadleaf's crown at scale 1 when there is no species library: its middle, half-width and half-height (world/forest/species.js). */
const DEFAULT_CROWN = { c: [0.5, 8.7, 0], r: 5.6, ry: 3.8 };
const PERCH = 0.85; // how far out in its crown a bird sits, as a share of the crown's half-width
// The dragonflies' swarm round her: forward, across (right), up, in metres from her body; just beyond her wingtips (3.75 m), so the
// chase camera behind her sees them flank her.
const SWARM = [[1.5, -4.8, 0.6], [-0.5, 5.2, 1.4], [0.8, 6.0, -0.2], [-1.5, -5.8, 1.8], [2.5, 4.2, 2.2], [0.2, -6.6, 1.0]];
const FOLLOW = { rise: 0.6, with: 4.0, peel: 1.2, away: 10 }; // seconds: catch up, follow her, peel off, home again (unseen) at `away`
// The small lizards: they turn from the water, run `metres` up the bank with her in `seconds` (easing in and out), then `ahead` more
// and `inland` into the trees in `into` seconds, out of sight once `hide` of the way in. Their legs go round once every `stride`
// metres covered (the small lizard's own stride at its size is 0.5 m: at her speed its feet would blur).
const RUN = { turn: 0.3, metres: 24, seconds: 4, out: 1.4, ahead: 8, inland: 25, into: 5, hide: 0.8, stride: 0.95, stagger: 0.05 };
// The frogs: a crouch and a leap `out` metres off the pad into the river, then they swim upstream on the surface and dive at `dive`.
const HOP = { crouch: 0.22, air: 0.62, height: 1.25, out: 1.5, stagger: 0.18 };
const SWIM = { speed: 1.5, kick: 2.2, dive: 6.0 };
// The splash as one goes in: a frog where it lands (at the end of its hop), a turtle partway down its slide (`at` of the way), each
// `size` of a splash her size (splash.js); one a frame late (a seek past it) by more than `fresh` seconds is left out.
export const IN = { frogs: { size: 0.4 }, turtle: { size: 0.55, at: 0.55 }, fresh: 0.3 };
// The birds: up out of the crown and to her (`rise`), with her (`with`), at the dragonflies' places round her `spread` wider, then
// off up and inland (`peel`), out of sight at `gone`.
const FLY = { stagger: 0.08, hop: 2.5, rise: 1.2, with: 4.0, peel: 2.0, gone: 7.2, beat: 7, spread: 1.4, over: 1.5 };
// The turtles: stretch their necks, then from `from` slide `seconds` off into the river, and are under at `gone`.
const SLIDE = { from: 1.6, seconds: 1.5, to: -0.6, gone: 3.3, stagger: 0.2 };

/**
 * A tree prop's crown where the plants' batcher puts it (world/forest/batch.js): its middle, half-width and half-height, from the
 * forest's species `library` (a broadleaf's usual crown without one).
 */
export function crownOf(prop, library = null) {
  const model = library ? library.get(prop.name, prop.variant, 1, {}) : null;
  const cr = model?.crown ?? DEFAULT_CROWN;
  const c = Math.cos(prop.rot), s = Math.sin(prop.rot), sc = prop.scale;
  const y = prop.y - (model?.sink ?? 0) * sc;
  const middle = new THREE.Vector3(prop.x + (cr.c[0] * c - cr.c[2] * s) * sc, y + cr.c[1] * sc, prop.z + (cr.c[0] * s + cr.c[2] * c) * sc);
  return { middle, r: cr.r * sc, ry: (cr.ry ?? cr.r) * sc };
}

export function createAnimals(world, route, { heightAt = () => 0, library = null, crowds = null, critters = {} } = {}) {
  const { river } = route;
  const own = !crowds;
  crowds ??= createCrowds(world);
  const baked = critters.smaedla ?? null;
  const memberOf = kind => (kind === 'lizards' && baked ? 'smaedla' : MEMBER[kind]);
  const models = {};
  const modelOf = kind => (models[kind] ??= (() => {
    if (kind === 'smaedla') {
      // the frames' names, as the crowd draws them (the same in both levels), and its height standing
      const morphs = (baked.lods[0].geometry.morphAttributes.position ?? []).map(a => a.name);
      return { morphs, height: baked.height, wings: false };
    }
    const model = createModel(kind);
    model.geometry.computeBoundingBox();
    model.height = model.geometry.boundingBox.max.y - model.geometry.boundingBox.min.y;
    return model;
  })());
  const libraryModel = (name, variant) => (library ? library.get(name, variant, 1, {}) : null);
  const topOf = (name, variant, scale) => {
    const model = libraryModel(name, variant);
    return model ? (model.height - (model.sink ?? 0)) * scale : DEFAULT_TOP[name] ?? 0;
  };

  /** A spot on the bank: `along` metres up the river from distance d, `e` from the water's edge on `side`. */
  function spot(d, side, along, e) {
    const r = river.at(d + along);
    const nx = -r.dir[1] * side;
    const nz = r.dir[0] * side;
    const off = r.half + e;
    return { x: r.x + nx * off, z: r.z + nz * off, level: r.level, dir: r.dir, out: [nx, nz] };
  }
  const headingOf = (dx, dz) => THREE.MathUtils.radToDeg(Math.atan2(dz, dx)); // degrees: 0 faces +X, 90 faces +Z

  const props = [];
  const clear = [];
  let trees = 0;
  const groups = route.groups.map(g => {
    const near = river.nearest(g.at[0], g.at[2]);
    const d = near.d;
    const side = g.side;
    const kind = memberOf(g.kind);
    const model = modelOf(kind);
    const scale = SCALE[kind];
    // the props first: the members sit on them
    const tops = [];
    const placed = [];
    for (const p of PROPS[g.kind] ?? []) {
      const variant = p.name === 'broadleaf' ? trees++ : p.variant;
      const at = spot(d, side, p.along, p.e);
      const y = p.name === 'waterLily' ? at.level + 0.012 : heightAt(at.x, at.z);
      const rot = p.lengthwise ? Math.atan2(-at.dir[1], at.dir[0]) : (props.length * 1.7) % TAU;
      const prop = { name: p.name, variant, x: at.x, y, z: at.z, rot, scale: p.scale };
      props.push(prop);
      placed.push(prop);
      clear.push({ x: at.x, z: at.z, r: CLEAR[p.name] ?? 0.9 });
      tops.push(p.name === 'waterLily' ? at.level + LILY_TOP : y + topOf(p.name, variant, p.scale));
    }
    const crown = g.kind === 'birds' ? crownOf(placed[0], library) : null;
    const members = LAYOUT[g.kind].map((m, k) => {
      let at;
      let y;
      let heading;
      if (g.kind === 'birds') {
        // on the crown's river side, facing out of it
        const [turn, up] = m;
        const water = spot(d, side, 0, 0);
        const tx = -water.out[0], tz = -water.out[1];
        const ox = tx * Math.cos(turn) - tz * Math.sin(turn);
        const oz = tx * Math.sin(turn) + tz * Math.cos(turn);
        const ring = Math.sqrt(1 - up * up) * crown.r * PERCH;
        at = { x: crown.middle.x + ox * ring, z: crown.middle.z + oz * ring, dir: water.dir, out: water.out };
        y = crown.middle.y + up * crown.ry;
        heading = headingOf(ox, oz);
      } else {
        at = spot(d, side, m.along, m.e);
        if (g.kind === 'frogs' || g.kind === 'turtle') y = tops[m.on];
        else if (g.kind === 'dragonflies') y = at.level + m.up;
        else y = heightAt(at.x, at.z);
        // they face the river (her), the lizards the water they drink, a little each their own way
        const toRiver = headingOf(-at.out[0], -at.out[1]);
        heading = g.kind === 'dragonflies' ? toRiver + 70 * Math.sin(k * 2.3) : toRiver + 22 * Math.sin(k * 2.9 + d);
      }
      clear.push({ x: at.x, z: at.z, r: 0.25 * scale + 0.4 });
      const home = new THREE.Vector3(at.x, y, at.z);
      return {
        kind, home, heading, rest: heading, position: home.clone(), morphs: Object.fromEntries(model.morphs.map(name => [name, 0])),
        visible: true, height: model.height * scale, scale, pitch: 0, squash: [1, 1, 1], wings: model.wings ? [0, 0] : null,
        along: g.kind === 'birds' ? 0 : m.along, e: g.kind === 'birds' ? PROPS.birds[0].e : m.e, d, side, phase: k * 1.37 + d * 0.01,
      };
    });
    crowds.reserve(kind, members.length, kind === 'smaedla' ? baked : { model });
    const point = crown ? crown.middle.clone() : members.reduce((sum, m) => sum.add(m.home), new THREE.Vector3()).divideScalar(members.length);
    const entry = {
      id: g.id, kind: g.kind, point, radius: crown ? Math.max(RADIUS, crown.r) : RADIUS, members, answered: false, start: null, handle: null,
      answer() {
        if (entry.answered) return DONE;
        entry.answered = true;
        entry.start = now();
        entry.handle = new Handle(`${g.id} answer`);
        return entry.handle;
      },
    };
    return entry;
  });

  let last = 0;
  const now = () => world.clock?.time ?? last;
  const her = new THREE.Vector3();
  const herNow = () => {
    if (world.flightPoint) return her.copy(world.flightPoint);
    if (world.flightU !== null && world.flightU !== undefined) return route.pointAt(world.flightU, her);
    return null;
  };
  const target = new THREE.Vector3();
  /** Moves a member `x` forward, `y` up and `z` to its right in its own frame at its heading (metres at scale 1, as the model's). */
  const nudge = (m, x, y, z) => {
    const h = m.heading * DEG;
    const c = Math.cos(h), s = Math.sin(h);
    m.position.x += (x * c - z * s) * m.scale;
    m.position.y += y * m.scale;
    m.position.z += (x * s + z * c) * m.scale;
  };
  const squash = (m, x, y, z) => { m.squash[0] = x; m.squash[1] = y; m.squash[2] = z; };

  /** Each member's pose at game time t: at rest (its life) or answering (`tau` seconds into the answer, null when it has none). */
  function pose(g, m, k, t, tau) {
    m.position.copy(m.home);
    m.heading = m.rest;
    m.visible = true;
    m.pitch = 0;
    squash(m, 1, 1, 1);
    const p = m.phase;
    switch (g.kind) {
      case 'frogs': {
        squash(m, 1, 1 + 0.03 * Math.sin(TAU * 0.7 * t + p), 1);
        m.morphs.leap = 0;
        if (tau === null) break;
        const u = tau - k * HOP.stagger;
        if (u <= 0) break;
        if (u >= SWIM.dive) { m.visible = false; break; } // dived: on its way under the water
        const water = spot(m.d, m.side, m.along, m.e - HOP.out); // where it lands, out from its pad
        const toRiver = headingOf(-water.out[0], -water.out[1]);
        if (u < HOP.crouch) {
          squash(m, 1.06, 1 - 0.18 * Math.sin((Math.PI / 2) * (u / HOP.crouch)), 1.06);
          m.heading = lerpAngle(m.rest, toRiver, smooth(u / HOP.crouch));
        } else if (u < HOP.crouch + HOP.air) {
          const a = (u - HOP.crouch) / HOP.air;
          m.position.set(m.home.x + (water.x - m.home.x) * a, m.home.y + (water.level - m.home.y) * a + 4 * HOP.height * a * (1 - a), m.home.z + (water.z - m.home.z) * a);
          m.heading = toRiver;
          m.morphs.leap = Math.sin(Math.PI * a);
          m.pitch = 0.35 * (1 - 2 * a); // nose up, then down to land
        } else {
          // swimming upstream on the surface, kicking
          const s = u - HOP.crouch - HOP.air;
          const at = spot(m.d, m.side, m.along + SWIM.speed * s, m.e - HOP.out);
          m.position.set(at.x, at.level, at.z);
          m.heading = lerpAngle(toRiver, headingOf(at.dir[0], at.dir[1]), smooth(s / 0.5));
          m.morphs.leap = 0.5 + 0.5 * Math.sin(TAU * SWIM.kick * s);
        }
        break;
      }
      case 'turtle': {
        const u = tau === null ? null : tau - k * SLIDE.stagger;
        const stretch = u === null ? 0 : envelope(u, 0.6, 0.6, 0.4);
        const look = Math.max(0, Math.sin((TAU * t) / 9 + p)) ** 2;
        m.morphs.look = look * (1 - stretch) + 0.6 * stretch;
        m.morphs.hide = -0.75 * stretch;
        m.pitch = 0.12 * stretch;
        squash(m, 1, 1 + 0.012 * Math.sin((TAU * t) / 3.2 + p), 1);
        if (u === null || u <= SLIDE.from) break;
        if (u >= SLIDE.gone) { m.visible = false; break; } // under: on its way along the riverbed
        // off its stone or log, nose down, into the river
        const a = smooth((u - SLIDE.from) / SLIDE.seconds);
        const at = spot(m.d, m.side, m.along, m.e + (SLIDE.to - m.e) * a);
        m.position.set(at.x, Math.max(m.home.y + (at.level - m.home.y) * a, heightAt(at.x, at.z), at.level), at.z);
        m.heading = lerpAngle(m.rest, headingOf(-at.out[0], -at.out[1]), smooth((u - SLIDE.from) / 0.4));
        m.pitch = -0.3 * Math.sin(Math.PI * a);
        break;
      }
      case 'birds': {
        // perched: looking about now and then, wings folded
        m.heading = m.rest + 18 * Math.sin((TAU * t) / 4.3 + p) * Math.max(0, Math.sin((TAU * t) / 11 + 2 * p));
        squash(m, 1, 1 + 0.02 * Math.sin(TAU * 0.9 * t + p), 1);
        m.wings[0] = 0;
        m.wings[1] = 0;
        if (tau === null) break;
        const u = tau - k * FLY.stagger;
        if (u <= 0) break;
        const body = herNow();
        if (u >= FLY.gone || !body) { m.visible = false; break; } // gone: on its way to the festival
        // a place by her, on their tree's side of her (so none crosses her), the dragonflies' places spread wider
        const r = river.at(river.nearest(body.x, body.z).d);
        const fx = r.dir[0], fz = r.dir[1];
        const [b, across, up] = SWARM[k % SWARM.length];
        const aside = (Math.abs(across) * FLY.spread + 0.5 * Math.sin(TAU * 0.9 * t + p)) * m.side;
        target.set(body.x + fx * b * FLY.spread - fz * aside, body.y + FLY.over + up * FLY.spread + 0.4 * Math.sin(TAU * 0.7 * t + p), body.z + fz * b * FLY.spread + fx * aside);
        const out = FLY.rise + FLY.with;
        const peel = smooth((u - out) / FLY.peel);
        if (peel > 0) {
          // off up and inland, out of the shot
          target.x += m.out[0] * 14 * peel * peel;
          target.y += 12 * peel * peel;
          target.z += m.out[1] * 14 * peel * peel;
        }
        const reach = smooth(u / FLY.rise);
        m.position.lerpVectors(m.home, target, reach);
        m.position.y += FLY.hop * smooth(u / 0.5) * (1 - reach); // up out of the crown first
        const toHer = headingOf(target.x - m.home.x, target.z - m.home.z);
        m.heading = lerpAngle(lerpAngle(toHer, headingOf(fx, fz), reach), headingOf(fx + m.out[0], fz + m.out[1]), peel);
        m.pitch = 0.4 * (1 - reach) + 0.35 * peel;
        m.wings[0] = 0.15 + 0.6 * Math.sin(TAU * FLY.beat * t + p);
        m.wings[1] = smooth(u / 0.25);
        break;
      }
      case 'dragonflies': {
        // hanging over the water, drifting, wings a blur
        m.morphs.hover = 1;
        m.wings[0] = 0.12 + 0.6 * Math.sin(TAU * 11 * t + p);
        m.wings[1] = 1;
        const drift = () => {
          nudge(m, 0.07 * Math.sin(t * 0.83 + p), 0.035 * Math.sin(t * 1.9 + 2 * p), 0.06 * Math.sin(t * 0.61 + 3 * p));
          m.heading -= 0.35 * Math.sin(t * 0.47 + p) / DEG;
        };
        if (tau === null || tau >= FOLLOW.away) { drift(); break; }
        const body = herNow();
        const out = FOLLOW.rise + FOLLOW.with;
        if (!body || tau >= out + FOLLOW.peel) { m.visible = false; break; } // gone off: home again, unseen, at FOLLOW.away
        // her forward: up the river where she is
        const r = river.at(river.nearest(body.x, body.z).d);
        const fx = r.dir[0], fz = r.dir[1];
        const [b, wide, up] = SWARM[k % SWARM.length];
        const across = Math.abs(wide) * m.side; // on their own side of her, so none crosses her
        const wob = 0.4 * Math.sin(TAU * 1.3 * t + p);
        target.set(body.x + fx * b - fz * (across + wob), body.y + up + 0.3 * Math.sin(TAU * 0.9 * t + p), body.z + fz * b + fx * (across + wob));
        if (tau >= out) target.y += 6 * smooth((tau - out) / FOLLOW.peel) ** 2; // peel off upward, out of the shot
        m.position.lerpVectors(m.home, target, smooth(tau / FOLLOW.rise));
        m.heading = headingOf(fx, fz);
        drift();
        break;
      }
      case 'lizards': {
        if (m.kind === 'smaedla') {
          smaedla(m, t, tau === null ? null : Math.max(0, tau - k * RUN.stagger));
          break;
        }
        const curl = 0.45 * (0.5 + 0.5 * Math.sin((TAU * t) / 7 + p));
        m.morphs.walkA = 0;
        m.morphs.walkB = 0;
        m.morphs.curl = curl;
        squash(m, 1, 1 + 0.035 * Math.sin(TAU * 0.8 * t + p), 1);
        if (tau === null) break;
        // up the bank with her, then off inland into the trees, out of sight as they reach them
        const u = Math.max(0, tau - k * RUN.stagger);
        const run = smooth((u - RUN.turn) / RUN.seconds);
        const inland = smooth((u - RUN.turn - RUN.seconds) / RUN.into);
        if (inland >= RUN.hide) { m.visible = false; break; }
        const along = RUN.metres * run + RUN.ahead * inland;
        const e = m.e + RUN.out * smooth((u - RUN.turn) / 1.0) + RUN.inland * inland;
        const at = spot(m.d, m.side, m.along + along, e);
        m.position.set(at.x, heightAt(at.x, at.z), at.z);
        const upstream = headingOf(at.dir[0], at.dir[1]);
        const into = headingOf(at.dir[0] * RUN.ahead + at.out[0] * RUN.inland, at.dir[1] * RUN.ahead + at.out[1] * RUN.inland);
        m.heading = lerpAngle(lerpAngle(m.rest, upstream, smooth(u / RUN.turn)), into, smooth((u - RUN.turn - RUN.seconds) / 0.6));
        const running = smooth(u / RUN.turn);
        if (running > 0) {
          const step = Math.sin((TAU * (RUN.metres * run + Math.hypot(RUN.ahead, RUN.inland) * inland)) / RUN.stride);
          m.morphs.curl = curl * (1 - running);
          m.morphs.walkA = running * Math.max(0, step);
          m.morphs.walkB = running * Math.max(0, -step);
        }
        break;
      }
      default: break;
    }
  }
  /**
   * The small lizard (the owner's model) at game time t, `u` seconds into its run (null before its answer): the same way up the bank
   * and inland as the salamander's, its pose from its clips (clipPose): drinking at the edge or standing about behind, looking up
   * at her as she passes over, running. The weights of its frames add up to 1.
   */
  function smaedla(m, t, u) {
    for (const name in m.morphs) m.morphs[name] = 0;
    const add = (pose, w) => { if (w > 0) for (const name in pose) m.morphs[name] += pose[name] * w; };
    let running = 0;
    let travelled = 0;
    if (u !== null) {
      const run = smooth((u - RUN.turn) / RUN.seconds);
      const inland = smooth((u - RUN.turn - RUN.seconds) / RUN.into);
      if (inland >= RUN.hide) { m.visible = false; return; }
      const e = m.e + RUN.out * smooth((u - RUN.turn) / 1.0) + RUN.inland * inland;
      const at = spot(m.d, m.side, m.along + RUN.metres * run + RUN.ahead * inland, e);
      m.position.set(at.x, heightAt(at.x, at.z), at.z);
      const upstream = headingOf(at.dir[0], at.dir[1]);
      const into = headingOf(at.dir[0] * RUN.ahead + at.out[0] * RUN.inland, at.dir[1] * RUN.ahead + at.out[1] * RUN.inland);
      m.heading = lerpAngle(lerpAngle(m.rest, upstream, smooth(u / RUN.turn)), into, smooth((u - RUN.turn - RUN.seconds) / 0.6));
      running = smooth(u / RUN.turn);
      travelled = RUN.metres * run + Math.hypot(RUN.ahead, RUN.inland) * inland;
    }
    const body = herNow();
    const look = body ? 1 - smooth((Math.hypot(body.x - m.home.x, body.z - m.home.z) - LOOK.near) / LOOK.fade) : 0;
    const still = 1 - running;
    const { clips } = baked;
    add(clipPose(baked, m.e < 1 ? 'drink' : 'idle', t, m.phase), still * (1 - look));
    add(clipPose(baked, 'look', ((look * LOOK.frame) / clips.look.frames) * clips.look.seconds), still * look);
    add(clipPose(baked, 'run', (travelled / RUN.stride) * clips.run.seconds, m.phase), running);
  }
  const lerpAngle = (a, b, k) => a + (((b - a + 540) % 360) - 180) * k;
  // the birds' way out of their tree: inland (away from the river) and upstream, from where they sit
  for (const g of groups) {
    if (g.kind !== 'birds') continue;
    const water = spot(g.members[0].d, g.members[0].side, 0, 0);
    for (const m of g.members) { m.out = water.out; m.dir = water.dir; }
  }

  // when (seconds into its answer) a member goes into the water, for its splash: null for those that do not
  const inAt = (g, k) => (g.kind === 'frogs' ? k * HOP.stagger + HOP.crouch + HOP.air
    : g.kind === 'turtle' ? k * SLIDE.stagger + SLIDE.from + IN.turtle.at * SLIDE.seconds : null);
  const effects = Boolean(world.effects && world.scene);
  function splashFrame(g, m, k, tau) {
    const when = inAt(g, k);
    if (when === null || m.splashed || tau === null || tau < when) return;
    m.splashed = true;
    if (!effects || tau - when > IN.fresh) return;
    const water = spot(m.d, m.side, m.along, g.kind === 'frogs' ? m.e - HOP.out : SLIDE.to);
    const point = new THREE.Vector3(g.kind === 'frogs' ? water.x : m.position.x, water.level, g.kind === 'frogs' ? water.z : m.position.z);
    splash(world, point, { size: IN[g.kind].size, count: 18, seed: `${g.id} ${k} in` });
  }

  function update(dt, t = now()) {
    last = t;
    if (own) crowds.begin(world.camera ?? null);
    for (const g of groups) {
      const tau = g.start === null ? null : t - g.start;
      const answering = tau !== null && tau < ANSWER[g.kind];
      const at = tau === null ? null : STAY.has(g.kind) ? Math.min(tau, ANSWER[g.kind]) : answering ? tau : null;
      g.members.forEach((m, k) => {
        pose(g, m, k, t, at);
        splashFrame(g, m, k, tau);
        if (m.visible) crowds.place(m.kind, m.position, m.heading, m.scale, m); // a member is its own pose: morphs, wings, pitch, squash
      });
      if (g.handle && !g.handle.done && tau >= ANSWER[g.kind]) g.handle.finish();
    }
    if (own) crowds.end();
  }

  return {
    crowds, group: crowds.group, props, clear, groups, update,
    dispose() {
      for (const g of groups) if (g.handle && !g.handle.done) g.handle.cancel();
      if (own) crowds.dispose();
    },
  };
}
