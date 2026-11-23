// The belt of cloud on the mountain's side (chapter 6, scenes 4 to 6: "Skýin utan í fjallinu"): pale, damp mountain ground that rises
// gently along the prints (+X), stones and low bushes and ferns lost in the white, her prints in it (world/props/mud-prints.js, her
// three-toed ones) and the cloud (cloud.js), centred on the stage. Its ground lies between 0 and 3 m everywhere the cloud reaches, so a
// camera's height over it reads the same to the fog everywhere (the fog thins with height above y 0: engine/fog.js).
// When her roar blows the cloud away it is blown back into a bank round them (`bank`: cloud cards standing 85 to 110 m out, white in
// the white until then), which hides where the stage's ground ends, and above it, ahead of them, the mountain's top shows, golden in
// the sunset (`summit`: the chapter puts it ahead of where the call left them).
//
//   const belt = createBelt(world, { grey, seed, prints, printSize, reduced, clear })
//     prints: [{ position: [x, z], heading, foot, water }]; reduced: the cloud's (the chapter's reducedMotion);
//     clear: [{ at: [x, z], r } | { from: [x, z], to: [x, z], r }] where nothing grows (the call's walks and where she stands)
//   belt.cloud, belt.prints (createMudPrints's, null with no prints), belt.heightAt(x, z), belt.seenAt(x, z) (its mesh, what feet stand
//   on), belt.update(dt, time), belt.dispose()
//   belt.pebbles.hop()      the little stones round the last print hop at her thud (a Handle, done when they have settled)
//   belt.summit.place(stand) the top's shape `SUMMIT.ahead` m ahead of { x, z, heading }; belt.summit.group
//   belt.bank               the cloud blown back round them (look.js createCloudCards)
import * as THREE from 'three';
import { GREY } from '../ardalur/terrain.js';
import { createMudPrints } from '../props/mud-prints.js';
import { createSpeciesLibrary } from '../forest/species.js';
import { Handle } from '../../engine/handle.js';
import { createCloud } from './cloud.js';
import { createNoiseTexture } from '../forest/materials.js';
import { groundMesh, linear, mixRGB, patchAt, seeded, smooth } from './ground.js';
import { createStageLook, plantMeshes, createCloudCards } from './look.js';

// the ground's reach, so far that the thinnest cloud a chapter stands in (level 0.25, about 40 m seen) has hidden its edge wholly (at
// 90 m a thin line of horizon still showed on the upright tablet), and the cloud's
export const BELT = { radius: 150, cloud: 60, plants: 105 };
// The ground's colours (linear): pale sage of short mountain grass, wet in the cloud; greyer stony patches and scree; moss darker in
// the hollows; the trodden mud round her prints a little darker and browner.
const PAINT = {
  grass: linear('#c6cbb0'), grassDeep: linear('#aab38f'), stone: linear('#d2cdbd'), moss: linear('#9aa87a'), trodden: linear('#b3a991'),
};
// The prints' own mud: damp mountain earth, darker in the print, its lip pale where the foot pushed it up, and out over the skirt the
// trodden ground's colour (as PAINT.trodden renders), so the print goes under the ground with no ring round it
const PRINT_MUD = { floor: '#4f4838', wall: '#5c5545', lip: '#9a937e', band: '#6f6857', outer: '#7a7563' };
/** The bank of cloud her roar leaves round them: its cards' distance from the last print, their heights (lower ahead, toward the top). */
const BANK = { from: 84, to: 104, rows: 2, cards: 24, width: [36, 52], height: [24, 42], ahead: 0.55 };
/** The top's shape: its middle `ahead` m on, its flat top `top` m up, `flat` m round, its foot `foot` m round and under the ground. */
export const SUMMIT = { ahead: 320, top: 88, flat: 70, foot: 260, under: -70 };
const PEBBLES = { count: 14, near: 0.55, far: 1.25, size: [0.18, 0.34], hop: [0.12, 0.3], seconds: 0.75 };

/** The belt's ground: 0.2 m low at the west, rising gently east along the prints to 2.8 m, with a slight swell. */
export function beltHeight(x, z) {
  return 1.5 + 1.3 * Math.tanh((x - 25) / 35) + 0.15 * Math.sin(x * 0.21 + 0.4) * Math.sin(z * 0.17 + 1.1);
}

/** How far (x, z) is from a clear spot or line ({ at, r } or { from, to, r }), less its radius: under 0 inside it. */
function clearOf(item, x, z) {
  if (item.at) return Math.hypot(x - item.at[0], z - item.at[1]) - item.r;
  const [ax, az] = item.from, [bx, bz] = item.to;
  const ex = bx - ax, ez = bz - az;
  const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
  return Math.hypot(x - ax - ex * k, z - az - ez * k) - item.r;
}

export function createBelt(world, { grey = false, seed = 6, prints = [], printSize = 5, reduced = false, clear = [] } = {}) {
  const heightAt = (x, z) => beltHeight(x, z);
  const group = new THREE.Group();
  group.name = 'Fjall: the belt of cloud';
  const look = grey ? null : createStageLook(world, { seed });
  // the trodden band along her prints: the way she walked, and Mosi after her
  const path = prints.map(p => p.position);
  const nearPath = (x, z) => {
    let best = Infinity;
    for (let i = 0; i + 1 < path.length; i++) best = Math.min(best, clearOf({ from: path[i], to: path[i + 1], r: 0 }, x, z));
    if (path.length === 1) best = Math.hypot(x - path[0][0], z - path[0][1]);
    return best;
  };
  const paint = (x, z, y, ny) => {
    const n = patchAt(x, z, seed), m = patchAt(x * 1.9, z * 1.7, seed + 3);
    let c = mixRGB(PAINT.grass, PAINT.grassDeep, smooth((n - 0.45) / 0.3) * 0.7);
    c = mixRGB(c, PAINT.stone, smooth((m - 0.62) / 0.16) * 0.8);
    c = mixRGB(c, PAINT.moss, smooth((0.38 - m) / 0.15) * 0.3);
    if (path.length) c = mixRGB(c, PAINT.trodden, (1 - smooth((nearPath(x, z) - printSize * 0.2) / (printSize * 0.5))) * 0.5);
    return [...c, smooth((0.75 - ny) / 0.2)];
  };
  const ground = groundMesh(heightAt, { radius: BELT.radius, step: 2.5, colour: GREY.ground, name: 'Belt ground', paint: look && paint, material: look?.ground });
  group.add(ground.mesh);
  const cloud = createCloud(world, { centre: [0, 0], radius: BELT.cloud, heightAt, seed, reduced });
  group.add(cloud.group);
  const marks = prints.length ? createMudPrints(world, { prints, heightAt, seed, size: printSize, shape: 'theropod', colours: grey ? null : PRINT_MUD }) : null;
  if (marks) group.add(marks.group); // with the place: hidden while another one shows

  // ---- stones, bushes and ferns, lost in the white: none on her way, nor where the chapter keeps clear ----
  const rng = seeded(seed * 31 + 7);
  const placements = [];
  const free = (x, z, r) => (!path.length || nearPath(x, z) > printSize * 0.9 + 2.2 + r) && clear.every(item => clearOf(item, x, z) > r);
  const KINDS = [['rock', 0.16, [1.1, 2.6]], ['rockSmall', 0.26, [0.8, 1.8]], ['bush', 0.2, [0.8, 1.25]], ['fern', 0.26, [0.9, 1.3]], ['mossHummock', 0.12, [0.9, 1.4]]];
  const pick = () => { let k = rng(); for (const kind of KINDS) { if ((k -= kind[1]) <= 0) return kind; } return KINDS[0]; };
  if (look) {
    for (let tries = 0; tries < 900 && placements.length < 260; tries++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * BELT.plants;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const [name, , [lo, hi]] = pick();
      const scale = lo + (hi - lo) * rng();
      if (!free(x, z, scale * 0.9)) continue;
      // clumps: a fern or a moss tuft by a rock now and then
      const lod = d < 45 ? 0 : 1;
      placements.push({ name, variant: Math.floor(rng() * 4), lod, x, y: heightAt(x, z) - 0.05, z, rot: rng() * Math.PI * 2, scale, sky: 0.95, phase: rng() });
    }
  }
  const plants = look ? plantMeshes(placements, { library: look.library, materials: look.plants, name: 'Belt plants' }) : null;
  if (plants) group.add(...plants.meshes);

  // ---- the little stones round the last print, that hop at her thud ----
  const pebbles = makePebbles(world, { prints, printSize, heightAt, seed, library: look?.library ?? null, free: (x, z) => !marks || marks.groundAt(x, z) <= heightAt(x, z) + 0.002 });
  if (pebbles.mesh) group.add(pebbles.mesh);

  // ---- the bank her roar leaves, and the top above it ----
  const last = prints.at(-1)?.position ?? [0, 0];
  let bank = null;
  const bankNoise = grey ? null : createNoiseTexture((seed ^ 0x2c1b) >>> 0); // createCloudCards's own for this seed, made once
  const top = makeSummit(world, { look, seed });
  group.add(top.group);
  const summit = {
    group: top.group, heightAt: top.heightAt,
    /** The top ahead of where Mosi stands ({ x, z, heading }), and the bank lower that way, so it shows over it after the roar. */
    place(stand) {
      top.place(stand);
      if (grey) return;
      bank?.dispose();
      bank = makeBank(world, { centre: last, seed, heightAt, toward: stand.heading, noise: bankNoise });
      group.add(bank.mesh);
    },
  };
  summit.place({ x: last[0], z: last[1], heading: prints.length ? prints.at(-1).heading : 35 });

  world.scene?.add?.(group); // a place adds itself, as Árdalurinn does (world/ardalur/index.js)
  return {
    group, heightAt, cloud, prints: marks,
    seenAt: (x, z) => ground.seenAt(x, z) ?? heightAt(x, z), // what feet stand on: the mesh (a print's mud lies in it)
    grey, pebbles, summit, plants: placements,
    get bank() { return bank; },
    update(dt, time) {
      cloud.update(dt, time);
      bank?.update(dt, time);
      pebbles.update(dt);
    },
    dispose() {
      marks?.dispose();
      cloud.dispose();
      ground.dispose();
      plants?.dispose();
      pebbles.dispose();
      bank?.dispose();
      bankNoise?.dispose();
      top.dispose();
      look?.dispose();
      group.removeFromParent();
    },
  };
}

/** The little stones round the last print (the game's small rock, small), one instanced mesh; hop() makes them jump twice. */
function makePebbles(world, { prints, printSize, heightAt, seed, library = null, free }) {
  const last = prints.at(-1);
  const none = { mesh: null, stones: [], hop: () => new Handle('pebbles').finish(), update() {}, dispose() {} };
  if (!last) return none;
  const model = (library ?? createSpeciesLibrary(seed)).get('rockSmall', 1, 1).solid;
  const geometry = new THREE.BufferGeometry();
  const colour = new THREE.Color();
  const col = [];
  for (let i = 0; i < model.count; i++) { colour.setRGB(model.col[i * 3], model.col[i * 3 + 1], model.col[i * 3 + 2], THREE.SRGBColorSpace); col.push(colour.r, colour.g, colour.b); }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(model.pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(model.nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(model.idx);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.name = 'fjall-pebbles';
  const rng = seeded(seed * 13 + 5);
  const [px, pz] = last.position;
  const stones = [];
  for (let tries = 0; tries < 200 && stones.length < PEBBLES.count; tries++) {
    const a = rng() * Math.PI * 2, d = printSize * (PEBBLES.near + (PEBBLES.far - PEBBLES.near) * rng());
    const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
    if (!free(x, z)) continue;
    stones.push({ x, z, y: heightAt(x, z), size: PEBBLES.size[0] + (PEBBLES.size[1] - PEBBLES.size[0]) * rng(), turn: rng() * 6.28, high: PEBBLES.hop[0] + (PEBBLES.hop[1] - PEBBLES.hop[0]) * rng(), delay: rng() * 0.15, lift: 0 });
  }
  const mesh = new THREE.InstancedMesh(geometry, material, stones.length);
  mesh.name = 'Pebbles';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const pose = () => {
    stones.forEach((s, i) => {
      dummy.position.set(s.x, s.y - 0.04 * s.size + s.lift, s.z);
      dummy.rotation.set(s.lift * 1.5, s.turn + s.lift * 3, 0);
      dummy.scale.setScalar(s.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  pose();
  let hopping = null; // { age, handle }
  return {
    mesh, stones,
    hop() {
      hopping?.handle.finish();
      hopping = { age: 0, handle: new Handle('pebbles hop') };
      return hopping.handle;
    },
    update(dt) {
      if (!hopping) return;
      hopping.age += dt;
      for (const s of stones) {
        const t = (hopping.age - s.delay) / PEBBLES.seconds; // two hops: a high one and a little one
        s.lift = t <= 0 || t >= 1 ? 0 : t < 0.62 ? s.high * Math.sin((t / 0.62) * Math.PI) : s.high * 0.3 * Math.sin(((t - 0.62) / 0.38) * Math.PI);
      }
      pose();
      if (hopping.age >= PEBBLES.seconds + 0.2) { hopping.handle.finish(); hopping = null; }
    },
    dispose() { geometry.dispose(); material.dispose(); mesh.dispose?.(); },
  };
}

/** The bank of cloud round the last print: two rows of standing cards, lower `toward` (degrees: the way the top shows). */
function makeBank(world, { centre, seed, heightAt, toward = 35, noise = null }) {
  const rng = seeded(seed * 17 + 3);
  const cards = [];
  for (let row = 0; row < BANK.rows; row++) {
    for (let i = 0; i < BANK.cards; i++) {
      const a = ((i + row * 0.5) / BANK.cards) * Math.PI * 2 + (rng() - 0.5) * 0.12;
      const d = BANK.from + (BANK.to - BANK.from) * (row / Math.max(1, BANK.rows - 1)) + (rng() - 0.5) * 6;
      const x = centre[0] + Math.cos(a) * d, z = centre[1] + Math.sin(a) * d;
      const w = BANK.width[0] + (BANK.width[1] - BANK.width[0]) * rng();
      // lower where the top shows over it, full height behind
      const facing = 0.5 + 0.5 * Math.cos(a - (toward * Math.PI) / 180);
      const h = (BANK.height[0] + (BANK.height[1] - BANK.height[0]) * rng()) * (1 - BANK.ahead * facing ** 2);
      cards.push({ x, z, y: heightAt(x, z) + h * 0.32, w, h, opacity: 0.95, seed: rng() * 10 });
    }
  }
  return createCloudCards(world, cards, { name: 'Cloud bank', renderOrder: 11, seed, noise });
}

/** The mountain's top seen from the belt: a broad shape with a flat top, its sides rock, its top green, under the belt's ground at its foot. */
function makeSummit(world, { look, seed }) {
  const group = new THREE.Group();
  group.name = 'The top, seen from the belt';
  // a plateau: its flat top's edge wanders a little round it, its shoulders round over and ease out into the slopes at its foot
  const heightAt = (x, z) => {
    const a = Math.atan2(z, x);
    const edge = SUMMIT.flat * (1 + 0.14 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 7 - seed * 2));
    const t = Math.min(1, Math.max(0, (Math.hypot(x, z) - edge) / (SUMMIT.foot - edge)));
    const rough = 1.5 * Math.sin(x * 0.09 + seed) * Math.sin(z * 0.08 - seed);
    return SUMMIT.top - (SUMMIT.top - SUMMIT.under) * t * t * (3 - 2 * t) + rough * (1 - t) * t * 6;
  };
  // the game's own ground colours, no sandstone layers (at 300 m they shimmer): green on the top and its shoulders, grey rock down its steep sides
  // (its grass a sunny yellow-green, so the low sun on it after the roar reads gold: LOOKS.afterRoar)
  const grass = linear('#b4b65c'), rock = linear('#b8a585'), scree = linear('#a8a27c');
  const paint = (x, z, y, ny) => [...mixRGB(mixRGB(scree, rock, smooth((0.85 - ny) / 0.3)), grass, smooth((ny - 0.72) / 0.12)), 0];
  const ground = groundMesh(heightAt, { radius: SUMMIT.foot, step: 6, colour: GREY.ground, name: 'Summit', paint: look && paint, material: look?.ground });
  ground.mesh.receiveShadow = false;
  group.add(ground.mesh);
  return {
    group, heightAt,
    /** The top `SUMMIT.ahead` m ahead of where Mosi stands ({ x, z, heading }), so it shows over the bank in the shots after the roar. */
    place({ x, z, heading }) {
      const a = (heading * Math.PI) / 180;
      group.position.set(x + Math.cos(a) * SUMMIT.ahead, 0, z + Math.sin(a) * SUMMIT.ahead);
    },
    dispose() { ground.dispose(); },
  };
}
