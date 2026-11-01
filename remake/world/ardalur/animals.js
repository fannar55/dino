// The animal groups on the banks of C (spec 5C), one after another as she flies up the river: frogs on lily pads, snails on a log,
// dragonflies over the water, a turtle on a stone, small lizards drinking at the edge. When she calls, a group answers her, once: the
// frogs jump (and croak: the chapter's sound), the snails lift their eyes, the dragonflies follow her in a swarm for 4 s, the turtle
// stretches its neck, the small lizards squeak and run along the bank with her for 5 s.
//
// They are the game's own critters (world/critters/models.js: one mesh each, at most 400 triangles), drawn larger than life (SCALE)
// so that they read from the air; the small lizards are the Fen's salamander until the owner chooses them a model of their own.
//
//   const animals = createAnimals(world, route, { heightAt, library });   // library: the forest's species (sizes of the props), optional
//   animals.group                          the critters, one mesh each (in world.scene)
//   animals.props                          what they sit on: [{ name, variant, x, y, z, rot, scale }] for the plants to grow (banks.js)
//   animals.clear                          [{ x, z, r }]: round each critter and prop, where no other plant may grow
//   animals.groups                         [{ id, kind, point, radius, members, answered, answer() -> Handle }], in the order she meets them
//   animals.update(dt, t)                  each frame, on the game clock (t): their life and their answers
//   animals.dispose()
//
// An answer is a function of the game clock: a capture or a seek that jumps to a time finds them where playing would have. The
// dragonflies follow her where she is now (world.flightPoint, or route.pointAt(world.flightU)); once they let her go they are out of
// sight until they are home again. answer() a second time is a finished Handle: a group answers once.
import * as THREE from 'three';
import { DONE, Handle } from '../../engine/handle.js';
import { createModel } from '../critters/models.js';
import { birdMaterial } from '../critters/critters.js';

/** How much larger than life each critter is drawn: they are seen from her back, 5 m up and 10 to 15 m off, at 14 to 16 m/s. */
export const SCALE = { frog: 3, snail: 4, dragonfly: 5, turtle: 3, salamander: 4 };
const MEMBER = { frogs: 'frog', snails: 'snail', dragonflies: 'dragonfly', turtle: 'turtle', lizards: 'salamander' };
/** How long each group's answer lasts, in seconds. */
export const ANSWER = { frogs: 1.6, snails: 3.2, dragonflies: 10, turtle: 3.4, lizards: 6.0 };
const RADIUS = 4; // metres: a group's tap target, wide (spec 6)
const SEEN = 160; // metres from the camera beyond which the critters are not drawn
const TAU = Math.PI * 2;
const clamp01 = k => Math.min(1, Math.max(0, k));
const smooth = k => { const x = clamp01(k); return x * x * (3 - 2 * x); };
/** 0 → 1 over `rise` seconds, 1 until `hold` more, 1 → 0 over `fall`: the shape of an answer that comes back to rest. */
const envelope = (tau, rise, hold, fall) => (tau < rise ? smooth(tau / rise) : tau < rise + hold ? 1 : 1 - smooth((tau - rise - hold) / fall));

// Where each member of a group sits: `along` metres up the river from the group's place, `e` metres from the water's edge (less
// than 0 over the water), `up` metres over the water (dragonflies) or on top of its prop.
const LAYOUT = {
  frogs: [{ along: -1.9, e: -1.5 }, { along: 0.2, e: -2.4 }, { along: 2.0, e: -1.3 }],
  snails: [{ along: -0.75, e: 2.2, turn: 0 }, { along: 0.05, e: 2.2, turn: 180 }, { along: 0.8, e: 2.2, turn: 0 }],
  dragonflies: [
    { along: -2.4, e: -3.2, up: 1.0 }, { along: -1.0, e: -2.4, up: 1.6 }, { along: 0.3, e: -3.6, up: 1.2 },
    { along: 1.4, e: -2.8, up: 0.9 }, { along: 2.6, e: -3.4, up: 1.5 },
  ],
  turtle: [{ along: 0, e: 1.1 }],
  lizards: [{ along: -2.6, e: 0.35 }, { along: -0.9, e: 0.3 }, { along: 0.8, e: 0.4 }, { along: 2.4, e: 0.3 }],
};
// What they sit on (forest species, world/forest/species.js), placed the same way.
const PROPS = {
  frogs: LAYOUT.frogs.map((m, i) => ({ name: 'waterLily', variant: i % 6, along: m.along, e: m.e, scale: 2.2 })),
  snails: [{ name: 'log', variant: 0, along: 0, e: 2.2, scale: 1.0, lengthwise: true }],
  turtle: [{ name: 'rock', variant: 1, along: 0, e: 1.1, scale: 1.0 }],
};
const LILY_TOP = 0.03; // metres a frog sits over the water on its pad
const DEFAULT_TOP = { log: 0.45, rock: 0.55 }; // a prop's top when there is no species library to measure it
// The dragonflies' swarm round her: forward, across (right), up, in metres from her body; just beyond her wingtips (3.75 m), so the
// chase camera behind her sees them flank her.
const SWARM = [[1.5, -4.8, 0.6], [-0.5, 5.2, 1.4], [0.8, 6.0, -0.2], [-1.5, -5.8, 1.8], [2.5, 4.2, 2.2]];
const FOLLOW = { rise: 0.6, with: 4.0, peel: 1.2, away: 10 }; // seconds: catch up, follow her, peel off, home again (unseen) at `away`
// The small lizards' run: they turn from the water, run RUN metres up the bank with her (easing in and out), and turn back to drink.
const RUN = { turn: 0.3, metres: 18, seconds: 5, out: 1.4, stride: 0.95, stagger: 0.12 };
const HOP = { crouch: 0.22, air: 0.62, land: 0.3, height: 1.25, stagger: 0.18 };

export function createAnimals(world, route, { heightAt = () => 0, library = null } = {}) {
  const { river } = route;
  const group = new THREE.Group();
  group.name = 'Árdalur animals';
  world.scene?.add?.(group);
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  ground.name = 'ardalur animals';
  const materials = [ground];
  const geometries = [];
  const models = {};
  const modelOf = kind => (models[kind] ??= (() => { const m = createModel(kind); geometries.push(m.geometry); return m; })());
  const topOf = (name, variant, scale) => {
    if (!library) return DEFAULT_TOP[name] ?? 0;
    const model = library.get(name, variant, 1, {});
    return (model.height - (model.sink ?? 0)) * scale;
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
  const groups = route.groups.map(g => {
    const near = river.nearest(g.at[0], g.at[2]);
    const d = near.d;
    const side = g.side;
    const kind = MEMBER[g.kind];
    const model = modelOf(kind);
    const scale = SCALE[kind];
    // the props first: the members sit on them
    const tops = [];
    for (const p of PROPS[g.kind] ?? []) {
      const at = spot(d, side, p.along, p.e);
      const y = p.name === 'waterLily' ? at.level + 0.012 : heightAt(at.x, at.z);
      const rot = p.lengthwise ? Math.atan2(-at.dir[1], at.dir[0]) : (props.length * 1.7) % TAU;
      props.push({ name: p.name, variant: p.variant, x: at.x, y, z: at.z, rot, scale: p.scale });
      clear.push({ x: at.x, z: at.z, r: p.name === 'log' ? 2.2 : p.name === 'rock' ? 1.2 : 0.9 });
      tops.push(p.name === 'waterLily' ? at.level + LILY_TOP : y + topOf(p.name, p.variant, p.scale));
    }
    const members = LAYOUT[g.kind].map((m, k) => {
      const at = spot(d, side, m.along, m.e);
      let y;
      if (g.kind === 'frogs') y = tops[k];
      else if (g.kind === 'snails' || g.kind === 'turtle') y = tops[0];
      else if (g.kind === 'dragonflies') y = at.level + m.up;
      else y = heightAt(at.x, at.z);
      // they face the river (her), the snails along their log, the lizards the water they drink
      const toRiver = headingOf(-at.out[0], -at.out[1]);
      const heading = g.kind === 'snails' ? headingOf(at.dir[0], at.dir[1]) + m.turn : g.kind === 'dragonflies' ? toRiver + 70 * Math.sin(k * 2.3) : toRiver;
      const flight = model.wings ? { value: new THREE.Vector2(0, 0) } : null;
      const material = flight ? birdMaterial(kind, { flight }) : ground;
      if (flight) materials.push(material);
      const mesh = new THREE.Mesh(model.geometry, material);
      mesh.name = kind;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const root = new THREE.Group();
      root.name = `${g.id} ${k + 1}`;
      root.scale.setScalar(scale);
      root.add(mesh);
      group.add(root);
      const home = new THREE.Vector3(at.x, y, at.z);
      clear.push({ x: at.x, z: at.z, r: 0.25 * scale + 0.4 });
      return { root, mesh, model, home, heading, phase: k * 1.37 + d * 0.01, flight, along: m.along, e: m.e, d, side };
    });
    const point = members.reduce((sum, m) => sum.add(m.home), new THREE.Vector3()).divideScalar(members.length);
    const entry = {
      id: g.id, kind: g.kind, point, radius: RADIUS, members, answered: false, start: null, handle: null,
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
  const setMorph = (mesh, name, value) => { mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]] = value; };
  const flap = (m, angle, open) => m.flight?.value.set(angle, open);

  /** Each member's pose at game time t: at rest (its life) or answering (`tau` seconds into the answer, null when it has none). */
  function pose(g, m, k, t, tau) {
    const { root, mesh } = m;
    root.position.copy(m.home);
    root.rotation.set(0, -THREE.MathUtils.degToRad(m.heading), 0);
    root.visible = true;
    mesh.position.set(0, m.model.pivot, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    const p = m.phase;
    switch (g.kind) {
      case 'frogs': {
        mesh.scale.set(1, 1 + 0.03 * Math.sin(TAU * 0.7 * t + p), 1);
        setMorph(mesh, 'leap', 0);
        if (tau === null) break;
        const u = tau - k * HOP.stagger;
        if (u <= 0) break;
        if (u < HOP.crouch) mesh.scale.set(1.06, 1 - 0.18 * Math.sin((Math.PI / 2) * (u / HOP.crouch)), 1.06);
        else if (u < HOP.crouch + HOP.air) {
          const a = (u - HOP.crouch) / HOP.air;
          root.position.y += 4 * HOP.height * a * (1 - a);
          setMorph(mesh, 'leap', Math.sin(Math.PI * a));
          mesh.rotation.z = 0.35 * (1 - 2 * a); // nose up, then down to land
        } else if (u < HOP.crouch + HOP.air + HOP.land) {
          const a = (u - HOP.crouch - HOP.air) / HOP.land;
          mesh.scale.set(1.05, 1 - 0.14 * Math.sin(Math.PI * a), 1.05);
        }
        break;
      }
      case 'snails': {
        const lift = tau === null ? 0 : envelope(tau - k * 0.2, 0.5, 1.8, 0.9);
        setMorph(mesh, 'hide', -0.1 * (0.5 + 0.5 * Math.sin(TAU * 0.25 * t + p)) - 0.55 * lift);
        mesh.rotation.z = 0.22 * lift; // the front up, to see her
        break;
      }
      case 'turtle': {
        const stretch = tau === null ? 0 : envelope(tau, 0.6, 2.0, 0.8);
        const look = Math.max(0, Math.sin((TAU * t) / 9 + p)) ** 2;
        setMorph(mesh, 'look', look * (1 - stretch) + 0.6 * stretch);
        setMorph(mesh, 'hide', -0.75 * stretch);
        mesh.rotation.z = 0.12 * stretch;
        mesh.scale.set(1, 1 + 0.012 * Math.sin((TAU * t) / 3.2), 1);
        break;
      }
      case 'dragonflies': {
        // hanging over the water, drifting, wings a blur
        mesh.position.set(0.07 * Math.sin(t * 0.83 + p), 0.035 * Math.sin(t * 1.9 + 2 * p), 0.06 * Math.sin(t * 0.61 + 3 * p));
        mesh.rotation.set(0, 0.35 * Math.sin(t * 0.47 + p), 0);
        setMorph(mesh, 'hover', 1);
        flap(m, 0.12 + 0.6 * Math.sin(TAU * 11 * t + p), 1);
        if (tau === null || tau >= FOLLOW.away) break;
        const body = herNow();
        const out = FOLLOW.rise + FOLLOW.with;
        if (!body || tau >= out + FOLLOW.peel) { root.visible = false; break; } // gone off: home again, unseen, at FOLLOW.away
        // her forward: up the river where she is
        const r = river.at(river.nearest(body.x, body.z).d);
        const fx = r.dir[0], fz = r.dir[1];
        const [b, across, up] = SWARM[k % SWARM.length];
        const wob = 0.4 * Math.sin(TAU * 1.3 * t + p);
        const target = new THREE.Vector3(body.x + fx * b - fz * (across + wob), body.y + up + 0.3 * Math.sin(TAU * 0.9 * t + p), body.z + fz * b + fx * (across + wob));
        if (tau >= out) target.y += 6 * smooth((tau - out) / FOLLOW.peel) ** 2; // peel off upward, out of the shot
        root.position.lerpVectors(m.home, target, smooth(tau / FOLLOW.rise));
        root.rotation.set(0, -Math.atan2(fz, fx), 0);
        break;
      }
      case 'lizards': {
        const curl = 0.45 * (0.5 + 0.5 * Math.sin((TAU * t) / 7 + p));
        setMorph(mesh, 'walkA', 0);
        setMorph(mesh, 'walkB', 0);
        setMorph(mesh, 'curl', curl);
        mesh.scale.set(1, 1 + 0.035 * Math.sin(TAU * 0.8 * t + p), 1);
        if (tau === null) break;
        const u = Math.max(0, tau - k * RUN.stagger);
        const run = smooth((u - RUN.turn) / RUN.seconds);
        const along = RUN.metres * run;
        const e = m.e + RUN.out * smooth((u - RUN.turn) / 1.0) * (1 - smooth((u - RUN.turn - RUN.seconds + 0.6) / 0.6) * 0.5);
        const at = spot(m.d, m.side, m.along + along, e);
        root.position.set(at.x, heightAt(at.x, at.z), at.z);
        // turned upstream while running, back to the water when stopped
        const upstream = headingOf(at.dir[0], at.dir[1]);
        const water = headingOf(-at.out[0], -at.out[1]);
        const turnAway = smooth(u / RUN.turn);
        const turnBack = smooth((u - RUN.turn - RUN.seconds) / RUN.turn);
        const heading = lerpAngle(lerpAngle(water, upstream, turnAway), water, turnBack);
        root.rotation.set(0, -THREE.MathUtils.degToRad(heading), 0);
        const running = Math.min(smooth(u / RUN.turn), 1 - turnBack);
        if (running > 0) {
          const step = Math.sin((TAU * along) / RUN.stride);
          setMorph(mesh, 'curl', curl * (1 - running));
          setMorph(mesh, 'walkA', running * Math.max(0, step));
          setMorph(mesh, 'walkB', running * Math.max(0, -step));
        }
        break;
      }
      default: break;
    }
  }
  const lerpAngle = (a, b, k) => a + (((b - a + 540) % 360) - 180) * k;

  function update(dt, t = now()) {
    last = t;
    const camera = world.camera?.position ?? null;
    for (const g of groups) {
      const tau = g.start === null ? null : t - g.start;
      const answering = tau !== null && tau < ANSWER[g.kind];
      // the lizards stay where they ran to: their answer's last pose is their rest
      const shown = !camera || camera.distanceTo(g.point) < SEEN || (g.kind === 'dragonflies' && answering);
      g.members.forEach((m, k) => {
        pose(g, m, k, t, tau === null ? null : g.kind === 'lizards' ? Math.min(tau, ANSWER.lizards) : answering ? tau : null);
        if (!shown) m.root.visible = false;
      });
      if (g.handle && !g.handle.done && tau >= ANSWER[g.kind]) g.handle.finish();
    }
  }

  return {
    group, props, clear, groups, update,
    dispose() {
      group.removeFromParent();
      for (const g of groups) if (g.handle && !g.handle.done) g.handle.cancel();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
