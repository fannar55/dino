// The mountain's slope (chapter 6, scene 3: "Fjallshlíðin"): a ledge on the path up, on the side of the ridge Grameðla walked along
// in chapter 4 (FJALL.ridge), 180 m east of its crest and 70 m below it, looking east over the whole forest. The land round it is
// the far land of chapter 4's flight (world/ardalur/far-land.js), shown, on the valley's terrain; the ledge and the path round it are
// a small stage of finer ground laid over the far land's (60 cm over it, sinking under it at the stage's rim), so the far land's
// big triangles never show through it. The cloud lies above, up the ridge (the belt: belt.js, a place of its own).
//
//   const slope = createSlope(world, { grey, route, seed })
//   slope.far (its far land, shown), slope.ledge ([x, z]), slope.heightAt(x, z), slope.update(dt, time), slope.dispose()
//   slope.glade(on)        Kambeðla's lilac glow in her glade, held on (a slow breath) while Egill speaks of it; off by default
//   slope.thorsedla        Þórseðla walking west out of the Fen at THORSEDLA.scale times her size: { at() -> [x, z], actor }
//   slope.deck             the cloud's underside over the ridge (look.js createCloudCards), with slope.wisps where it meets the path
//
// Not grey: the game's own ground material painted with grass, a trodden path and stone where it is steep; the game's own low
// plants and rocks (world/forest/species.js); the far land's haze thinned to HAZE_SHARE, so the forest reads in the low sun; the
// pool's water catching the sky; a plume of spray at the falls.
import * as THREE from 'three';
import { createRoute, FALLS } from '../../chapters/kafli4-route.js';
import { createTerrain, GREY } from '../ardalur/terrain.js';
import { createFarLand, createFarHaze, FAR } from '../ardalur/far-land.js';
import { createFarFriends } from '../props/far-friends.js';
import { createSpeciesLibrary } from '../forest/species.js';
import { FJALL, groundMesh, linear, mixRGB, patchAt, seeded, smooth } from './ground.js';
import { createStageLook, plantMeshes, createCloudCards } from './look.js';
import { viewForest } from './view.js';
import { leafMeanOf } from '../forest/materials.js';

const LEDGE = { east: 180, shelf: 12, up: 1, over: 0.6, radius: 70, rim: 20 }; // m: east of the ridge, the shelf's half width, ...
// The path: up from the south onto the shelf (kafli6-route.js SLOPE: from, ride, ledge), then west up the ridge into the cloud.
const PATH = [[-2395, 190], [-2392, 160], [-2390, 144], [-2386, 124], [-2402, 130], [-2424, 142], [-2446, 152]];
const PAINT = { grass: '#c4ce88', grassDeep: '#adbd74', dry: '#dccf98', stone: '#c2baa6', trodden: '#c9b896' };
const PLANTS = { count: 240, reach: 115, shelf: 15, path: 3.2 };
const MEADOW_COUNT = 70;
const MOSI_STAND = [-2386, 124]; // where he stands on the ledge and turns (kafli6-route.js SLOPE.ledge)
const HAZE_SHARE = 1; // of the far land's haze: at its full the forest 1.5 to 2.4 km off is a pale wash from here
// Þórseðla: out of the Fen, walking west toward the mountain (heading 200: west and a little north, so she is seen side-on)
export const THORSEDLA = { from: [-170, 150], heading: 200, speed: 6, scale: 8, walk: 0.5 };
// The cloud's underside: flat cards over the ridge, west of the ledge (the view east keeps its sky), and wisps where it meets the path
const DECK = { centre: [-2760, 150], half: [330, 620], step: 120, y: 274, width: [170, 230] };
const WISPS = [[-2500, 150], [-2490, 112], [-2512, 190], [-2505, 72], [-2522, 230], [-2480, 168]]; // [x, z]: where the ground is about 265 m up
const GLADE_GLOW = 90; // m: the glade's glow while it is held on (far-land.js KAMBEDLA.size is 22, for the flight 600 m off)
const SPRAY = { cards: 7, width: [26, 40], height: [22, 34] };

export function createSlope(world, { grey = false, route = createRoute(), seed = 4 } = {}) {
  const terrain = createTerrain(route, { seed });
  const haze = createFarHaze();
  const far = createFarLand(world, route, { terrain, seed, haze });
  far.show(true);
  // the far land takes the far haze only, not the height fog: from 240 m up the fog lies thick on the valley floor 2 km off and
  // the whole forest was a white sea
  far.ground.material.fog = false;
  far.ground.material.needsUpdate = true;
  const ledge = [FJALL.ridge[0] + LEDGE.east, FJALL.ridge[1]];
  const shelf = far.heightAt(...ledge) + LEDGE.up;
  // the stage: over the far land, and a level shelf round the ledge; sunk under the far land at its rim
  const heightAt = (x, z) => {
    const land = far.heightAt(x, z);
    const d = Math.hypot(x - ledge[0], z - ledge[1]);
    if (d >= LEDGE.radius) return land;
    const over = LEDGE.over - (LEDGE.over + 0.4) * smooth((d - (LEDGE.radius - LEDGE.rim)) / LEDGE.rim);
    const level = shelf - 0.04 * Math.max(0, d - LEDGE.shelf) ** 1.5;
    return Math.max(land + over, d < LEDGE.radius - LEDGE.rim ? level : -Infinity);
  };
  const group = new THREE.Group();
  group.name = 'Fjall: the slope';
  const look = grey ? null : createStageLook(world, { seed });
  const fromPath = (x, z) => {
    let best = Infinity;
    for (let i = 0; i + 1 < PATH.length; i++) {
      const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
      const ex = bx - ax, ez = bz - az;
      const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
      best = Math.min(best, Math.hypot(x - ax - ex * k, z - az - ez * k));
    }
    return best;
  };
  const C = Object.fromEntries(Object.entries(PAINT).map(([k, v]) => [k, linear(v)]));
  const paint = (x, z, y, ny) => {
    const n = patchAt(x, z, seed), m = patchAt(x * 1.7, z * 1.9, seed + 5);
    let c = mixRGB(C.grass, C.grassDeep, smooth((n - 0.45) / 0.3) * 0.8);
    c = mixRGB(c, C.dry, smooth((m - 0.58) / 0.2) * 0.8);
    c = mixRGB(c, C.trodden, (1 - smooth((fromPath(x, z) - 0.8) / 1.8)) * 0.75);
    const rock = smooth((0.8 - ny) / 0.2);
    return [...mixRGB(c, C.stone, rock * 0.7), rock];
  };
  const ground = groundMesh(heightAt, { centre: ledge, radius: LEDGE.radius, step: 2, colour: GREY.ground, name: 'Slope ground', paint: look && paint, material: look?.ground });
  group.add(ground.mesh, far.group);

  // ---- low plants and rocks, on the stage and the far land's ground round it: none on the path, nor on the shelf ----
  const placements = [];
  if (look) {
    const rng = seeded(seed * 37 + 11);
    const KINDS = [['fern', 0.26, [0.8, 1.2]], ['flowers', 0.18, [0.8, 1.1]], ['rockSmall', 0.2, [0.8, 1.7]], ['rock', 0.12, [1.0, 1.9]], ['bush', 0.12, [0.7, 1.1]], ['mossHummock', 0.12, [0.8, 1.3]]];
    const pick = () => { let k = rng(); for (const kind of KINDS) { if ((k -= kind[1]) <= 0) return kind; } return KINDS[0]; };
    for (let tries = 0; tries < 1200 && placements.length < PLANTS.count; tries++) {
      const a = rng() * Math.PI * 2, d = LEDGE.shelf + Math.sqrt(rng()) * (PLANTS.reach - LEDGE.shelf);
      const x = ledge[0] + Math.cos(a) * d, z = ledge[1] + Math.sin(a) * d;
      const [name, , [lo, hi]] = pick();
      const scale = lo + (hi - lo) * rng();
      if (fromPath(x, z) < PLANTS.path + scale || d < PLANTS.shelf + scale) continue;
      if ((name === 'rock' || name === 'bush' || name === 'mossHummock') && x > ledge[0] + 4 && d < 55) continue; // nothing big in front of the view east
      placements.push({ name, variant: Math.floor(rng() * 4), lod: d < 40 ? 0 : 1, x, y: heightAt(x, z) - 0.05, z, rot: rng() * Math.PI * 2, scale, sky: 1, phase: rng() });
    }
    // a meadow in front of the view east: flowers, ferns and moss on the shelf's east side and down from it, low enough to look over
    // (none where Mosi stands and turns, nor on the path)
    const MEADOW = [['flowers', 0.65, [1.0, 1.5]], ['fern', 0.35, [0.6, 0.9]]];
    for (let tries = 0, made = 0; tries < 900 && made < MEADOW_COUNT; tries++) {
      const a = (rng() - 0.5) * Math.PI * 0.9, d = 4 + rng() * 52;
      const x = ledge[0] + 10 + Math.cos(a) * d, z = ledge[1] + 4 + Math.sin(a) * d;
      let k = rng(), kind = MEADOW[0];
      for (const m of MEADOW) { if ((k -= m[1]) <= 0) { kind = m; break; } }
      const [name, , [lo, hi]] = kind;
      const scale = lo + (hi - lo) * rng();
      if (fromPath(x, z) < 2.4 || Math.hypot(x - MOSI_STAND[0], z - MOSI_STAND[1]) < 7.5) continue;
      placements.push({ name, variant: Math.floor(rng() * 4), lod: 0, x, y: heightAt(x, z) - 0.05, z, rot: rng() * Math.PI * 2, scale, sky: 1, phase: rng() });
      made++;
    }
  }
  const library = look ? createSpeciesLibrary(seed) : null;
  const plants = look ? plantMeshes(placements, { library, materials: look.plants, name: 'Slope plants' }) : null;
  if (plants) group.add(...plants.meshes);

  // ---- the cloud's underside over the ridge, and its wisps where the path goes up into it ----
  let deck = null, wisps = null, spray = null, pool = null, forest = null;
  if (look) {
    const rng = seeded(seed * 53 + 2);
    const cards = [];
    for (let x = -DECK.half[0]; x <= DECK.half[0]; x += DECK.step) {
      for (let z = -DECK.half[1]; z <= DECK.half[1]; z += DECK.step) {
        const w = DECK.width[0] + (DECK.width[1] - DECK.width[0]) * rng();
        cards.push({ x: DECK.centre[0] + x + (rng() - 0.5) * 40, z: DECK.centre[1] + z + (rng() - 0.5) * 40, y: DECK.y + (rng() - 0.5) * 10, w, h: w * (0.8 + 0.3 * rng()), opacity: 0.95, seed: rng() * 10, flat: true, turn: rng() * Math.PI });
      }
    }
    deck = createCloudCards(world, cards, { name: 'Slope cloud deck', renderOrder: 12, seed, noise: look.noise, fogShare: 0.3 });
    wisps = createCloudCards(world, WISPS.map(([x, z], k) => ({ x, z, y: Math.min(heightAt(x, z) + 10, DECK.y - 4), w: 70 + 20 * (k % 3), h: 34 + 8 * (k % 2), opacity: 0.9, seed: k * 1.7 + 0.4 })), { name: 'Slope wisps', renderOrder: 13, seed, noise: look.noise });
    // the falls' spray: a plume rising from the foot of the falls over its lip, white in the low sun (from the ledge, west of it and
    // above, the falls' face looks away: the spray over the lip is what shows them)
    spray = createCloudCards(world, Array.from({ length: SPRAY.cards }, (_, k) => {
      const w = SPRAY.width[0] + (SPRAY.width[1] - SPRAY.width[0]) * rng();
      return { x: FALLS.x + 18 + (rng() - 0.3) * 30, z: FALLS.z + (rng() - 0.5) * 34, y: FALLS.base + 14 + k * 7, w, h: SPRAY.height[0] + (SPRAY.height[1] - SPRAY.height[0]) * rng(), opacity: 0.55, seed: rng() * 10 };
    }), { name: 'Falls spray', renderOrder: 12, seed, noise: look.noise, fogShare: 0.6 });
    // the far pool: water that catches the sky (its colour the sky's own low down, as the look sets it)
    const geometry = new THREE.CircleGeometry(route.pool.radius + 4, 48);
    geometry.rotateX(-Math.PI / 2);
    pool = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }));
    pool.name = 'Far pool water';
    pool.position.set(route.pool.center[0], route.pool.level + 0.15, route.pool.center[1]);
    pool.renderOrder = 6;
    group.add(deck.mesh, wisps.mesh, spray.mesh, pool);
    forest = viewForest(world, { far, terrain, route, haze, library, from: ledge, seed, leafTone: world.q?.name === 'low' ? 1 : leafMeanOf(look.leaf) });
    group.add(forest.mesh);
  }

  // ---- Þórseðla, out of the Fen, on her way to the mountain ----
  const thorsedla = {
    walked: 0,
    at() {
      const h = THREE.MathUtils.degToRad(THORSEDLA.heading);
      return [THORSEDLA.from[0] + Math.cos(h) * this.walked, THORSEDLA.from[1] + Math.sin(h) * this.walked];
    },
    get actor() { return friends?.actorOf('thorsedla') ?? null; },
  };
  const friends = grey ? null : createFarFriends(world, {
    friends: { thorsedla: { position: [THORSEDLA.from[0], 0, THORSEDLA.from[1]], heading: THORSEDLA.heading, clip: 'walk', find: false, heightAt: far.heightAt } },
  });
  let scaled = false;

  let gladeOn = false;
  const glowSize = far.kambedla.glow.material.uniforms.uSize.value;
  world.scene?.add?.(group); // a place adds itself, as Árdalurinn does (world/ardalur/index.js)
  let disposed = false;
  let clock = 0;
  const sky = new THREE.Color();
  return {
    group, heightAt, far, ledge, grey, deck, wisps, thorsedla, plants: placements, get forest() { return forest; },
    glade(on = true) { gladeOn = Boolean(on); },
    update(dt = 0, time = 0) {
      const step = Math.min(0.1, Math.max(0, dt));
      clock += step;
      far.update(FAR.from, world.camera); // the far land shows (it is drawn in its flight's window) and the camera sees far
      haze.uniforms.uFarHaze.value.w = HAZE_SHARE;
      // the glade: a slow breath, never quite out, while it is on
      const glow = far.kambedla.glow.material.uniforms;
      glow.uLevel.value = gladeOn ? 0.8 + 0.2 * Math.sin(clock * 2.4) : 0;
      glow.uSize.value = gladeOn ? GLADE_GLOW : glowSize; // big enough to be seen from 1.6 km
      for (const cards of [deck, wisps, spray]) cards?.update(step, time);
      if (pool && world.look?.sky?.horizon) pool.material.color.set(sky.set(world.look.sky.horizon).lerp(new THREE.Color(world.look.sky.zenith ?? '#9fb7d0'), 0.35));
      if (friends) {
        thorsedla.walked += step * THORSEDLA.speed;
        const actor = friends.actorOf('thorsedla');
        if (actor) {
          if (!scaled) { scaled = true; actor.root.scale.setScalar(THORSEDLA.scale); actor.play('walk', { fade: 0, timeScale: THORSEDLA.walk }); }
          const [x, z] = thorsedla.at();
          actor.place(x, z, THORSEDLA.heading);
        }
        friends.show(true);
        if (world.camera) friends.update(step, world.camera, world.renderer?.domElement?.height ?? 800);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      far.update(-1, world.camera); // hidden, and the camera's own far plane back
      far.dispose();
      friends?.dispose();
      ground.dispose();
      plants?.dispose();
      forest?.dispose();
      for (const cards of [deck, wisps, spray]) cards?.dispose();
      if (pool) { pool.geometry.dispose(); pool.material.dispose(); }
      look?.dispose();
      group.removeFromParent();
    },
  };
}
