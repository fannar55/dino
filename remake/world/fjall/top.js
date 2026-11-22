// The mountain's top (chapter 6, scene 7, and the festival's stage: "Sléttur og víður"): flat and wide within `radius`, its ground
// between 0 and 3 m there, rounding over past it into the sea of cloud, which lies flat at FJALL.top.sea round it to the horizon,
// its western bank rising toward the low sun. Built alone (the festival builds it: `toppur: { build: world => createTop(world) }`),
// with nothing of chapter 6's in it.
//
//   const top = createTop(world, { grey, seed, radius })
//   top.group, top.heightAt(x, z), top.update(dt, time), top.dispose()
//   top.centre ([0, 0]), top.radius
//   top.edge(angle) -> [x, z]          the rim at `angle` (radians, from +x toward +z): where the ground meets the cloud
//   top.wayUp(angle) -> [[x, z] x 3]   the way a friend comes up at `angle`: from under the sea, over the rim, 8 m inside it
//   top.room -> [{ friend, at, r }]    where each of the six friends stands at the festival: a disc half her length, none
//                                      overlapping, all inside the flat, ROOM.middle m round the middle kept free
//   top.sea                            { level, setGlow(v), wave({ from, strength, seconds }) -> Handle, cards, bank }
//   top.veil                           { setLevel(v), level }: the last wisp chapter 6 climbs out of, by the south-west rim (0 gone, 1 thick)
//
// Not grey: the game's own ground material painted as a meadow (grass, a little dry grass, stone only on the steep), the game's own
// low plants and single rocks (world/forest/species.js), none in a friend's room; the sea and its bank are cloud cards (look.js
// createCloudCards) lit by the scene's own light, as is everything on it: no light is baked into a colour, so lightTo can give it
// the evening or a night.
import * as THREE from 'three';
import { GREY } from '../ardalur/terrain.js';
import { Handle } from '../../engine/handle.js';
import { FJALL, groundMesh, linear, mixRGB, patchAt, seeded, smooth } from './ground.js';
import { createStageLook, plantMeshes, createCloudCards } from './look.js';

const SHOULDER = 16; // metres past the flat over which the ground rounds over to under the sea
const WAY = { under: 14, inside: 8 }; // a way up: from `under` m out past the rim (under the sea) to `inside` m inside it
// The friends' rooms: [friend, length (STYLE.md section 3; Flugeðla her wingspan), bearing (degrees), metres from the middle]. The
// south-west, 100 to 160 degrees, is kept free: Grameðla comes up there (chapter 6's veil, kafli6-route.js TOP).
const ROOM = {
  middle: 12,
  friends: [['thorsedla', 22, -90, 26], ['kambedla', 7, -40, 24], ['uggedla', 14, 10, 26], ['sloedla', 7.5, 60, 22], ['flugedla', 7.5, -145, 22], ['gramedla', 12, 175, 24]],
};
const PAINT = { grass: '#a9bb6c', grassDeep: '#92a75c', dry: '#c9bd84', stone: '#b5ad98' };
const PLANTS = { count: 190, room: 1 };
// The sea of cloud: rings of flat cards from the rim to the horizon, each ring `grow` times the last's radius
const SEA = { from: 34, to: 2400, grow: 1.16, across: 0.42, base: -4 };
// Its western bank, toward the low sun (LOOKS.sunset's azimuth 215: bearing -145 here), rising with distance
const BANK = { bearing: -145, spread: 70, from: 900, to: 2000, rows: 3, cards: 18, height: [40, 380], width: [280, 460] };
const RIM = { cards: 44, out: 5, rise: [1.5, 4], width: [20, 32] }; // puffs lying round the rim, higher than the sea: the ground goes into cloud, not over an edge
const HEAPS = { count: 70, from: 140, to: 1500, height: [10, 46] };
const VEIL = { at: [-27, 37], cards: 6 }; // by the south-west rim, where Grameðla climbs out of the cloud
const WAVE = { speed: 160, width: 70 };

export function createTop(world, { grey = false, seed = 6, radius = FJALL.top.radius } = {}) {
  const s = seed * 0.37;
  const flat = (x, z) => 1.2 + 0.45 * Math.sin(x * 0.07 + s) * Math.sin(z * 0.06 - s) + 0.25 * Math.sin((x + z) * 0.13 + s * 2);
  const drop = 1.2 - FJALL.top.sea + 6;
  const heightAt = (x, z) => {
    const out = Math.hypot(x, z) - radius;
    return out <= 0 ? flat(x, z) : flat(x, z) - drop * smooth(out / SHOULDER);
  };
  /** The rim at `angle`: where the ground goes under the sea, found along the ray past the flat. */
  const edge = angle => {
    const c = Math.cos(angle), n = Math.sin(angle);
    let lo = radius, hi = radius + SHOULDER;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (heightAt(c * mid, n * mid) > FJALL.top.sea) lo = mid; else hi = mid;
    }
    return [c * lo, n * lo];
  };
  const wayUp = angle => {
    const [x, z] = edge(angle);
    const d = Math.hypot(x, z), c = x / d, n = z / d;
    return [[c * (d + WAY.under), n * (d + WAY.under)], [x, z], [c * (d - WAY.inside), n * (d - WAY.inside)]];
  };
  const room = ROOM.friends.map(([friend, length, bearing, d]) => {
    const a = THREE.MathUtils.degToRad(bearing);
    return { friend, at: [Math.cos(a) * d, Math.sin(a) * d], r: length / 2 };
  });

  const group = new THREE.Group();
  group.name = 'Fjall: the top';
  const look = grey ? null : createStageLook(world, { seed });
  const C = Object.fromEntries(Object.entries(PAINT).map(([k, v]) => [k, linear(v)]));
  const paint = (x, z, y, ny) => {
    const n = patchAt(x, z, seed), m = patchAt(x * 1.8, z * 1.6, seed + 9);
    let c = mixRGB(C.grass, C.grassDeep, smooth((n - 0.45) / 0.3) * 0.8);
    c = mixRGB(c, C.dry, smooth((m - 0.6) / 0.2) * 0.6);
    const rock = smooth((0.8 - ny) / 0.2);
    return [...mixRGB(c, C.stone, rock * 0.6), rock * 0.5];
  };
  const ground = groundMesh(heightAt, { radius: radius + SHOULDER + 10, step: grey ? 2.5 : 1.5, colour: GREY.ground, name: 'Top ground', paint: look && paint, material: look?.ground });
  group.add(ground.mesh);

  // ---- grass and low plants, single rocks: none in a friend's room ----
  const placements = [];
  if (look) {
    const rng = seeded(seed * 43 + 1);
    const KINDS = [['flowers', 0.34, [0.8, 1.3]], ['fern', 0.24, [0.6, 1.0]], ['mossHummock', 0.04, [0.7, 1.0]], ['rockSmall', 0.14, [0.7, 1.5]], ['flowers', 0.1, [1.0, 1.4]], ['bush', 0.08, [0.6, 0.95]], ['rock', 0.06, [1.0, 1.8]]];
    const pick = () => { let k = rng(); for (const kind of KINDS) { if ((k -= kind[1]) <= 0) return kind; } return KINDS[0]; };
    for (let tries = 0; tries < 1500 && placements.length < PLANTS.count; tries++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (radius + 4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const [name, , [lo, hi]] = pick();
      const scale = lo + (hi - lo) * rng();
      if (room.some(r => Math.hypot(x - r.at[0], z - r.at[1]) < r.r + PLANTS.room + scale)) continue;
      // nothing tall in the free middle, nor on the way she comes up (south-west)
      const big = name === 'rock' || name === 'bush' || name === 'mossHummock';
      if (big && (d < ROOM.middle || Math.hypot(x - VEIL.at[0] * 0.8, z - VEIL.at[1] * 0.8) < 14)) continue;
      placements.push({ name, variant: Math.floor(rng() * 4), lod: 0, x, y: heightAt(x, z) - 0.05, z, rot: rng() * Math.PI * 2, scale, sky: 1, phase: rng() });
    }
  }
  const plants = look ? plantMeshes(placements, { library: look.library, materials: look.plants, name: 'Top plants' }) : null;
  if (plants) group.add(...plants.meshes);

  // ---- the sea of cloud, its western bank and the veil ----
  let seaCards = null, bank = null, veil = null, base = null, rimCards = null;
  const sunward = THREE.MathUtils.degToRad(BANK.bearing);
  if (look) {
    const rng = seeded(seed * 59 + 3);
    const cards = [];
    for (let r = SEA.from; r < SEA.to; r *= SEA.grow) {
      const n = Math.ceil((Math.PI * 2) / SEA.across);
      for (let i = 0; i < n; i++) {
        const a = ((i + rng() * 0.6) / n) * Math.PI * 2;
        const d = r * (1 + (rng() - 0.5) * 0.12);
        const w = d * SEA.across * (1.5 + rng() * 0.5) + 30;
        cards.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: FJALL.top.sea + (rng() - 0.5) * 1.2 + Math.min(4, d / 300), w, h: w * (0.75 + 0.3 * rng()), opacity: 0.97, seed: rng() * 10, flat: true, turn: rng() * Math.PI });
      }
    }
    seaCards = createCloudCards(world, cards, { name: 'Sea of cloud', renderOrder: 10, seed, noise: look.noise, fogShare: 0.6 });
    // the bank: standing heaps toward the sun, higher the further they stand, so it rises to it
    const heaps = [];
    for (let row = 0; row < BANK.rows; row++) {
      for (let i = 0; i < BANK.cards; i++) {
        const k = (i + row * 0.5 + rng() * 0.4) / BANK.cards - 0.5;
        const a = sunward + THREE.MathUtils.degToRad(BANK.spread) * 2 * k;
        const d = BANK.from + (BANK.to - BANK.from) * ((row + rng() * 0.6) / BANK.rows);
        const rise = Math.max(0, 1 - Math.abs(k) * 1.9) ** 1.5 * ((d - BANK.from) / (BANK.to - BANK.from) * 0.5 + 0.5); // highest toward the sun
        const h = BANK.height[0] + (BANK.height[1] - BANK.height[0]) * Math.max(0, rise);
        const w = BANK.width[0] + (BANK.width[1] - BANK.width[0]) * rng();
        heaps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: FJALL.top.sea + h * 0.3, w, h, opacity: 0.95, seed: rng() * 10 });
      }
    }
    bank = createCloudCards(world, heaps, { name: 'Sea of cloud: western bank', renderOrder: 9, seed, noise: look.noise, fogShare: 0.25 });
    const rim = [];
    for (let i = 0; i < RIM.cards; i++) {
      const a = ((i + rng() * 0.7) / RIM.cards) * Math.PI * 2;
      const [ex, ez] = edge(a);
      const d = Math.hypot(ex, ez) + RIM.out * (0.6 + 0.8 * rng());
      const w = RIM.width[0] + (RIM.width[1] - RIM.width[0]) * rng();
      rim.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: FJALL.top.sea + RIM.rise[0] + (RIM.rise[1] - RIM.rise[0]) * rng(), w, h: w * 0.8, opacity: 0.95, seed: rng() * 10, flat: true, turn: rng() * Math.PI });
    }
    // and heaps standing out of it here and there, so far off it reads as cloud, not a flat lake
    for (let i = 0; i < HEAPS.count; i++) {
      const a = rng() * Math.PI * 2, d = HEAPS.from + (HEAPS.to - HEAPS.from) * rng() ** 0.7;
      const h = HEAPS.height[0] + (HEAPS.height[1] - HEAPS.height[0]) * rng() * (0.5 + d / HEAPS.to);
      rim.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: FJALL.top.sea + h * 0.15, w: h * (2.2 + rng()), h, opacity: 0.9, seed: rng() * 10 });
    }
    rimCards = createCloudCards(world, rim, { name: 'Sea of cloud: round the rim and its heaps', renderOrder: 11, seed, noise: look.noise, fogShare: 0.4 });
    rimCards.setGlow(0.35, '#f6e4da'); // a pale light of their own: a standing heap against the low sun went brown
    veil = createCloudCards(world, Array.from({ length: VEIL.cards }, (_, k) => ({
      x: VEIL.at[0] + (rng() - 0.5) * 14, z: VEIL.at[1] + (rng() - 0.5) * 14, y: 0.5 + rng() * 2.5, w: 9 + rng() * 6, h: 5 + rng() * 4, opacity: 0.6, seed: k * 2.1 + 0.3,
    })), { name: 'Top veil', renderOrder: 13, seed, noise: look.noise, fogShare: 0.2 });
    veil.setOpacity(0);
    veil.setGlow(0.55, '#f6e4da'); // its own pale light: against the low sun a standing wisp went brown as smoke
    group.add(seaCards.mesh, bank.mesh, rimCards.mesh, veil.mesh);
  }
  // under the cards, so nothing shows through between them: a pale disc lit as they are (grey: the sea itself)
  const baseGeometry = new THREE.CircleGeometry(SEA.to * 1.1, 64).rotateX(-Math.PI / 2);
  const baseMaterial = new THREE.MeshLambertMaterial({ color: grey ? GREY.snag : '#f2efe9' });
  baseMaterial.name = 'fjall-sea';
  base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.name = grey ? 'Sea of cloud (grey)' : 'Sea of cloud: under the cards';
  base.position.y = FJALL.top.sea + (grey ? 0 : SEA.base);
  group.add(base);

  // ---- the sea's wave: a swell running out over the cards from `from` ----
  let wave = null;
  const centres = seaCards?.mesh.geometry.getAttribute('aCentre');
  const rest = centres ? Float32Array.from(centres.array) : null;
  function swell(dt) {
    if (!wave || !centres) return;
    wave.age += dt;
    const front = wave.age * WAVE.speed;
    const fade = 1 - smooth(wave.age / wave.seconds);
    for (let card = 0; card < centres.count; card += 4) {
      const dx = rest[card * 3] - wave.from[0], dz = rest[card * 3 + 2] - wave.from[1];
      const k = (Math.hypot(dx, dz) - front) / WAVE.width;
      const lift = wave.strength * fade * Math.exp(-k * k);
      for (let i = card; i < card + 4; i++) centres.array[i * 3 + 1] = rest[i * 3 + 1] + lift;
    }
    centres.needsUpdate = true;
    if (wave.age >= wave.seconds) {
      centres.array.set(rest);
      centres.needsUpdate = true;
      wave.handle.finish();
      wave = null;
    }
  }

  world.scene?.add?.(group); // a place adds itself, as Árdalurinn does (world/ardalur/index.js)
  let disposed = false;
  return {
    group, heightAt, grey, centre: [0, 0], radius, edge, wayUp, room, plants: placements,
    sea: {
      level: FJALL.top.sea, cards: seaCards, bank,
      /** A warm light of the sea's own (the festival's glow under the night): 0 none, 1 full. The rim's puffs and heaps take it too, in
       * place of the pale light of their own they have at the sunset (set at the build; chapter 6 never calls this). */
      setGlow(v) { seaCards?.setGlow(v); bank?.setGlow(v * 0.6); rimCards?.setGlow(v); },
      /** A swell running out over the sea from `from` ([x, z]), `strength` m high, over `seconds`; a Handle, done when it has passed. */
      wave({ from = [0, 0], strength = 3, seconds = 4 } = {}) {
        wave?.handle.finish();
        if (centres) centres.array.set(rest);
        const handle = new Handle('sea wave');
        if (!centres) { handle.finish(); return handle; }
        wave = { from, strength, seconds: Math.max(0.1, seconds), age: 0, handle };
        return handle;
      },
    },
    veil: {
      level: 0,
      /** The last wisp by the south-west rim: 0 gone, 1 as thick as it comes. */
      setLevel(v) { this.level = Math.min(1, Math.max(0, v)); veil?.setOpacity(this.level); },
    },
    update(dt = 0, time = 0) {
      const step = Math.min(0.1, Math.max(0, dt));
      for (const cards of [seaCards, bank, rimCards, veil]) cards?.update(step, time);
      swell(step);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wave?.handle.finish();
      ground.dispose();
      plants?.dispose();
      for (const cards of [seaCards, bank, rimCards, veil]) cards?.dispose();
      baseGeometry.dispose(); baseMaterial.dispose();
      look?.dispose();
      group.removeFromParent();
    },
  };
}
