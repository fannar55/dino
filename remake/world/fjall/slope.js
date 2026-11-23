// The mountain's slope (chapter 6, scene 3: "Fjallshlíðin"): a ledge on the path up, on the side of the ridge Grameðla walked along
// in chapter 4 (FJALL.ridge), 180 m east of its crest and 70 m below it, looking east over the whole forest. The land round it is
// the far land of chapter 4's flight (world/ardalur/far-land.js), shown, on the valley's terrain; the ledge and the path round it are
// a small stage of finer ground laid over the far land's (60 cm over it, sinking under it at the stage's rim), so the far land's
// big triangles never show through it. The cloud lies above, up the ridge (the belt: belt.js, a place of its own).
//
//   const slope = createSlope(world, { grey, route, seed })
//   slope.far (its far land, shown), slope.ledge ([x, z]), slope.heightAt(x, z), slope.seenAt(x, z) (its mesh, what feet stand on),
//   slope.update(dt, time), slope.dispose()
//   slope.glade(on)        Kambeðla's lilac glow in her glade, held on (a slow breath) while Egill speaks of it; off by default
//   slope.thorsedla        Þórseðla walking north-west in the forest at THORSEDLA.scale times her size: { at() -> [x, z], actor }
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
import { FJALL, groundMesh, linear, mixRGB, patchAt, seeded, smooth } from './ground.js';
import { createStageLook, plantMeshes, createCloudCards } from './look.js';
import { viewForest } from './view.js';
import { createViewHaze } from './view-haze.js';
import { leafMeanOf } from '../forest/materials.js';

const LEDGE = { east: 180, shelf: 12, up: 1, over: 0.6, radius: 70, rim: 20 }; // m: east of the ridge, the shelf's half width, ...
// The brink: east of the ledge the shelf ends BRINK m from its middle (a few metres in front of Mosi as he stands looking east), and
// the mountain falls away under it to the valley, so the view east is over the edge and not over 40 m of flat shelf
const BRINK = { east: 15.5, cos: [0.75, 0.92] };
// The path: up from the south onto the shelf (kafli6-route.js SLOPE: from, ride, ledge), then west up the ridge into the cloud.
const PATH = [[-2395, 190], [-2392, 160], [-2390, 144], [-2386, 124], [-2402, 130], [-2424, 142], [-2446, 152]];
const PAINT = { grass: '#c4ce88', grassDeep: '#adbd74', dry: '#dccf98', stone: '#c2baa6', trodden: '#c9b896' };
const PLANTS = { count: 520, reach: 115, shelf: 15, path: 3.2 };
const MEADOW_COUNT = 70;
const MOSI_STAND = [-2386, 124]; // where he stands on the ledge and turns (kafli6-route.js SLOPE.ledge)
// Þórseðla: on her way from the Fen to the mountain, north of the glade's line from the ledge, walking north-west (seen side-on from
// the ledge, her long neck across the view). Her own size against the forest (the owner's F1 report of 2026-11-23: at 9 times her
// size she stood "3-4 tré á hæð"): on the forest floor, `sink` m under the far land's canopy surface (view.js CANOPY_SINK), her
// back about as high as the treetops and her head a neck over them, `scale` times the game's Þórseðla; so that a neck over the
// trees is still seen, she walks 750 m out from the ledge on the line it saw her on at 1.3 km. Her walk's clip at `walk` times its
// pace and `speed` m/s in step with it (her stride grows with her scale).
// (reach: m she walks at most, far more than scene 3 lasts, some 45 s: a slope left built does not walk her off over the mountains)
export const THORSEDLA = { from: [-1696, -156], heading: 235, speed: 2.3, scale: 4.2, walk: 0.45, reach: 600, sink: 15 };
// The cloud's underside: flat cards over the ridge, west of the ledge (the view east keeps its sky), and over every mountain round
// the slope whose land would rise into it (DECK.over m under it or higher): the far land there is held under it (CEILING), so a
// mountain goes up into the cloud and no grey peak stands over it; wisps where it meets the path
const DECK = { centre: [-2760, 150], half: [330, 620], step: 120, y: 274, width: [170, 230], reach: 1700, over: 34, keep: [25, 260] };
const CEILING = 262; // m: the far land near the slope no higher (under the deck's lowest cards)
const WISPS = [[-2500, 150], [-2490, 112], [-2512, 190], [-2505, 72], [-2522, 230], [-2480, 168]]; // [x, z]: where the ground is about 265 m up
const LYING = { count: 48, under: 40, w: [150, 230], h: [60, 85], above: 16 }; // more wisps where the cloud lies on the mountains round
// The far land as the view sees it (its own instance, reshaped once): the mountains' sides round the slope green under the cloud,
// the Fen a pale patch of reed in the forest, and a line of low hills where the land ends, under the haze
const MOUNTAIN_GREEN = { from: 80, full: 170, reach: [1900, 2600], colours: ['#7f9a4e', '#93a85a', '#6f8a46'] };
const FEN = { x: -60, z: 90, r: 420, edge: 140, colour: '#efe4b4', share: 0.9 };
const HILLS = { from: 3200, full: 5200, height: 110 };
// The glade: Kambeðla's plates (the far land's own glow, held on) and over them a big soft lilac light, to be found from 1.6 km
const GLADE = { x: -832, z: -192, size: 340, colour: [0.5, 0.3, 0.95], above: 30 };
// The water the view sees, catching the evening's cool last light (the slope is nearly night, the owner's word of 2026-11-23: a
// warm peach here made the river a pink ribbon): the river from where it comes out of the mountains, over the falls, past the pool
// and on to the Fen, wider than it is from `wide` m off (from 1 to 2.3 km off it was a thread), and the pool; its edges a little
// darker and bluer than its middle (the banks in it)
const WATER = { widen: 2.4, more: 4, wide: [500, 1500], rise: 0.4, colour: '#8e9cc8', warm: 0.4, poolMore: 14, edge: [0.8, 0.84, 0.94], meander: [14, 95] };
const SPRAY = { cards: 7, width: [26, 40], height: [22, 34] };

export function createSlope(world, { grey = false, route = createRoute(), seed = 4 } = {}) {
  const terrain = createTerrain(route, { seed });
  const haze = createFarHaze();
  const far = createFarLand(world, route, { terrain, seed, haze });
  far.show(true);
  const ledge = [FJALL.ridge[0] + LEDGE.east, FJALL.ridge[1]];
  const deckCards = grey ? [] : deckOver(far, ledge, seed); // where the land rises into the cloud: before it is held under it
  reshapeFar(far, ledge, seed);
  // the far land takes the view's own haze, not the height fog: from 240 m up the fog lies thick on the valley floor 2 km off and
  // the whole forest was a white sea (view-haze.js)
  const view = createViewHaze();
  if (!grey) view.patch(far.ground.material, 'slope-far-land');
  else { far.ground.material.fog = false; far.ground.material.needsUpdate = true; }
  const shelf = far.heightAt(...ledge) + LEDGE.up;
  // the stage: over the far land, and a level shelf round the ledge; sunk under the far land at its rim
  const heightAt = (x, z) => {
    const land = far.heightAt(x, z);
    const d = Math.hypot(x - ledge[0], z - ledge[1]);
    if (d >= LEDGE.radius) return land;
    const over = LEDGE.over - (LEDGE.over + 0.4) * smooth((d - (LEDGE.radius - LEDGE.rim)) / LEDGE.rim);
    const level = shelf - 0.04 * Math.max(0, d - LEDGE.shelf) ** 1.5;
    const east = smooth(((x - ledge[0]) / Math.max(d, 1e-6) - BRINK.cos[0]) / (BRINK.cos[1] - BRINK.cos[0]));
    const edge = LEDGE.radius - LEDGE.rim - (LEDGE.radius - LEDGE.rim - BRINK.east) * east;
    // past its edge the shelf rounds over and falls steeply till it meets the land (a cut there stepped on the mesh's grid)
    const past = Math.max(0, d - edge);
    return Math.max(land + over, level - 0.6 * past - 1.1 * past ** 1.6);
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
    for (let tries = 0; tries < 3000 && placements.length < PLANTS.count; tries++) {
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
      if (heightAt(x, z) < shelf - 1.2) continue; // on the shelf, not over the brink
      placements.push({ name, variant: Math.floor(rng() * 4), lod: 0, x, y: heightAt(x, z) - 0.05, z, rot: rng() * Math.PI * 2, scale, sky: 1, phase: rng() });
      made++;
    }
  }
  const library = look ? look.library : null;
  const plants = look ? plantMeshes(placements, { library, materials: look.plants, name: 'Slope plants' }) : null;
  if (plants) group.add(...plants.meshes);

  // ---- the cloud's underside over the ridge, and its wisps where the path goes up into it ----
  let deck = null, wisps = null, spray = null, pool = null, river = null, forest = null, halo = null;
  if (look) {
    const rng = seeded(seed * 53 + 2);
    deck = createCloudCards(world, deckCards, { name: 'Slope cloud deck', renderOrder: 12, seed, noise: look.noise, fogShare: 0.3 });
    // where the land goes up into it (or near it: a ridge's crest under it), nearest the slope first
    const rank = c => Math.hypot(c.x - ledge[0], c.z - ledge[1]);
    const lying = deckCards.filter(c => c.over && far.heightAt(c.x, c.z) > DECK.y - LYING.under).sort((a, b) => rank(a) - rank(b)).slice(0, LYING.count);
    wisps = createCloudCards(world, [
      ...WISPS.map(([x, z], k) => ({ x, z, y: Math.min(heightAt(x, z) + 10, DECK.y - 4), w: 70 + 20 * (k % 3), h: 34 + 8 * (k % 2), opacity: 0.9, seed: k * 1.7 + 0.4 })),
      ...lying.map((c, k) => ({ x: c.x, z: c.z, y: Math.min(far.heightAt(c.x, c.z) + LYING.above, DECK.y - 4), w: LYING.w[0] + (LYING.w[1] - LYING.w[0]) * rng(), h: LYING.h[0] + (LYING.h[1] - LYING.h[0]) * rng(), opacity: 0.8, seed: k * 2.3 + 1.1 })),
    ], { name: 'Slope wisps', renderOrder: 13, seed, noise: look.noise });
    wisps.setGlow(0.45, '#f6e4da'); // a pale light of their own: against the low sun a standing wisp went brown as smoke (top.js's veil)
    // the falls' spray: a plume rising from the foot of the falls over its lip, white in the low sun (from the ledge, west of it and
    // above, the falls' face looks away: the spray over the lip is what shows them)
    spray = createCloudCards(world, Array.from({ length: SPRAY.cards }, (_, k) => {
      const w = SPRAY.width[0] + (SPRAY.width[1] - SPRAY.width[0]) * rng();
      return { x: FALLS.x + 18 + (rng() - 0.3) * 30, z: FALLS.z + (rng() - 0.5) * 34, y: FALLS.base + 14 + k * 7, w, h: SPRAY.height[0] + (SPRAY.height[1] - SPRAY.height[0]) * rng(), opacity: 0.55, seed: rng() * 10 };
    }), { name: 'Falls spray', renderOrder: 12, seed, noise: look.noise, fogShare: 0.6 });
    spray.setGlow(0.5, '#fff1e2'); // white in the low sun from here, not brown against the land
    // the water: the river and the far pool showing the sky over them, warm where the eye meets it low, in the haze
    const waterMaterial = skyWater(world, view, false);
    const riverMaterial = skyWater(world, view, true);
    const geometry = new THREE.CircleGeometry(route.pool.radius + WATER.poolMore, 48);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(route.pool.center[0], route.pool.level + WATER.rise, route.pool.center[1]);
    drape(geometry, far.heightAt);
    pool = new THREE.Mesh(geometry, waterMaterial);
    pool.name = 'Far pool water';
    pool.renderOrder = 6;
    const ribbon = riverRibbon(route, ledge);
    drape(ribbon, far.heightAt);
    river = new THREE.Mesh(ribbon, riverMaterial);
    river.name = 'Slope view: the river';
    river.renderOrder = 6;
    halo = gladeHalo(far);
    group.add(deck.mesh, wisps.mesh, spray.mesh, pool, river, halo.mesh);
    forest = viewForest(world, { far, terrain, route, haze: view.cards, library, from: ledge, seed, leafTone: world.q?.name === 'low' ? 1 : leafMeanOf(look.leaf), river: WATER });
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
    friends: {
      thorsedla: {
        position: [THORSEDLA.from[0], -THORSEDLA.sink, THORSEDLA.from[1]], heading: THORSEDLA.heading, clip: 'walk', find: false, heightAt: far.heightAt,
        tint: base => view.patch(base.clone(), 'slope-thorsedla'), // in the view's haze as the land round her (no height fog)
      },
    },
  });
  // with the place: hidden while another one shows (createFarFriends puts its group in the scene; prepared ahead, main.js draws the
  // slope once in Árdalurinn's place, and her far Þórseðla stood 200 m tall in scenes 1 and 2)
  if (friends) {
    group.add(friends.group);
    // a capture's seek (and main.js's warm-up) waits for her model, as it does for what else loads (world.loading)
    const loading = (world.loading ??= new Set());
    const loaded = friends.ready();
    loading.add(loaded);
    loaded.finally(() => loading.delete(loaded));
  }
  let scaled = false;

  let gladeOn = false;
  const glowSize = far.kambedla.glow.material.uniforms.uSize.value;
  world.scene?.add?.(group); // a place adds itself, as Árdalurinn does (world/ardalur/index.js)
  let disposed = false;
  let clock = 0;
  return {
    group, heightAt, seenAt: (x, z) => ground.seenAt(x, z) ?? heightAt(x, z), far, ledge, grey, deck, wisps, thorsedla, plants: placements, get forest() { return forest; },
    glade(on = true) { gladeOn = Boolean(on); },
    update(dt = 0, time = 0) {
      if (!group.visible) { far.update(-1, world.camera); return; } // not the place in view: the camera's own far plane, nothing moved
      const step = Math.min(0.1, Math.max(0, dt));
      clock += step;
      far.update(FAR.from, world.camera); // the far land shows (it is drawn in its flight's window) and the camera sees far
      view.update(world);
      // the glade: a slow breath, never quite out, while it is on: her plates, and the big soft light over them
      const breath = gladeOn ? 0.8 + 0.2 * Math.sin(clock * 2.4) : 0;
      far.kambedla.glow.material.uniforms.uLevel.value = breath;
      far.kambedla.glow.material.uniforms.uSize.value = glowSize;
      if (halo) {
        halo.mesh.visible = gladeOn;
        halo.uniforms.uLevel.value = breath;
      }
      for (const cards of [deck, wisps, spray]) cards?.update(step, time);
      if (friends) {
        friends.show(true); // first: showing puts each friend back at her home (far-friends.js ground), and she walks on from it
        thorsedla.walked = Math.min(THORSEDLA.reach, thorsedla.walked + step * THORSEDLA.speed);
        const actor = friends.actorOf('thorsedla');
        if (actor) {
          if (!scaled) { scaled = true; actor.root.scale.setScalar(THORSEDLA.scale); actor.play('walk', { fade: 0, timeScale: THORSEDLA.walk }); }
          const [x, z] = thorsedla.at();
          actor.place(x, z, THORSEDLA.heading);
        }
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
      river?.geometry.dispose();
      river?.material.dispose();
      halo?.dispose();
      look?.dispose();
      group.removeFromParent();
    },
  };
}

// ---- the view's far land, cloud, water and glade ----
const hash2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
const swell = (x, z, f, s) => 0.5 + 0.25 * Math.sin(x * f + s) * Math.sin(z * f * 1.13 - s * 0.7) + 0.25 * Math.sin((x * 0.71 - z * 0.69) * f * 1.9 + s * 2.3);

/** The cloud's underside: its grid over the ridge, and a card over every place round the slope where the land rises into it. */
function deckOver(far, ledge, seed) {
  const rng = seeded(seed * 53 + 7);
  const cards = [];
  const card = (x, z) => {
    const w = DECK.width[0] + (DECK.width[1] - DECK.width[0]) * rng();
    cards.push({ x: x + (rng() - 0.5) * 40, z: z + (rng() - 0.5) * 40, y: DECK.y + (rng() - 0.5) * 10, w, h: w * (0.8 + 0.3 * rng()), opacity: 0.95, seed: rng() * 10, flat: true, turn: rng() * Math.PI });
  };
  const S = DECK.step, R = DECK.reach;
  const rises = (x, z) => { // the land round (x, z) goes up into the cloud
    let high = -Infinity;
    for (const [a, b] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) high = Math.max(high, far.heightAt(x + a * S * 1.4, z + b * S * 1.4));
    return high > DECK.y - DECK.over;
  };
  const inGrid = (x, z) => Math.abs(x - DECK.centre[0]) <= DECK.half[0] + DECK.step / 2 && Math.abs(z - DECK.centre[1]) <= DECK.half[1] + DECK.step / 2;
  for (let x = -DECK.half[0]; x <= DECK.half[0]; x += DECK.step) {
    for (let z = -DECK.half[1]; z <= DECK.half[1]; z += DECK.step) {
      card(DECK.centre[0] + x, DECK.centre[1] + z);
      cards.at(-1).over = rises(DECK.centre[0] + x, DECK.centre[1] + z);
    }
  }
  for (let x = ledge[0] - R; x <= ledge[0] + R; x += S) {
    for (let z = ledge[1] - R; z <= ledge[1] + R; z += S) {
      if (Math.hypot(x - ledge[0], z - ledge[1]) > R || inGrid(x, z)) continue;
      if (x > ledge[0] - DECK.keep[0] && Math.abs(z - ledge[1]) < DECK.keep[1]) continue; // the sky over the ledge and the view east
      if (rises(x, z)) { card(x, z); cards.at(-1).over = true; }
    }
  }
  return cards;
}

/** The far land reshaped for the view: held under the cloud near the slope and green there, the Fen pale, low hills at its end. */
function reshapeFar(far, ledge, seed) {
  const geometry = far.ground.geometry;
  const position = geometry.attributes.position, colour = geometry.attributes.color;
  const greens = MOUNTAIN_GREEN.colours.map(linear), reed = linear(FEN.colour);
  for (let v = 0; v < position.count; v++) {
    const x = position.getX(v), z = position.getZ(v);
    let y = position.getY(v);
    const d = Math.hypot(x - ledge[0], z - ledge[1]);
    let c = [colour.getX(v), colour.getY(v), colour.getZ(v)];
    // the mountains round the slope: green up their sides, and up into the cloud (no higher than CEILING under it)
    const near = 1 - smooth((d - MOUNTAIN_GREEN.reach[0]) / (MOUNTAIN_GREEN.reach[1] - MOUNTAIN_GREEN.reach[0]));
    const up = smooth((y - MOUNTAIN_GREEN.from) / (MOUNTAIN_GREEN.full - MOUNTAIN_GREEN.from)) * near;
    if (up > 0) {
      const n = swell(x, z, 0.013, seed), g = n < 0.5 ? mixRGB(greens[2], greens[0], n * 2) : mixRGB(greens[0], greens[1], n * 2 - 1);
      c = mixRGB(c, g, up * 0.85);
    }
    if (near > 0 && y > CEILING) y = CEILING + (y - CEILING) * 0.04;
    // the river above the valley's painted on the far land: meadow now (the view's own water bends over it: riverRibbon)
    const along = upperFrom(x, z);
    if (along < 40) c = mixRGB(c, greens[1], (1 - smooth((along - 16) / 24)) * 0.9);
    // the Fen: pale reed, a patch the forest stands round
    const fen = 1 - smooth((Math.hypot(x - FEN.x, z - FEN.z) - FEN.r) / FEN.edge);
    if (fen > 0) c = mixRGB(c, mixRGB(reed, [reed[0] * 0.9, reed[1] * 0.92, reed[2] * 0.8], hash2(x, z)), fen * FEN.share);
    // low hills where the land ends, east, under the haze
    if (x > ledge[0] && d > HILLS.from) y += HILLS.height * smooth((d - HILLS.from) / (HILLS.full - HILLS.from)) * (0.45 + 0.55 * swell(x, z, 0.0021, seed * 2));
    position.setY(v, y);
    colour.setXYZ(v, c[0], c[1], c[2]);
  }
  position.needsUpdate = colour.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/**
 * Water that shows the sky over it as the eye sees it there (sky.js's gradient and its band at the horizon: seen steeply, the sky
 * high up; grazing, its low band), warmer where the eye meets it low (the low sun's light in the air over it), in the view's haze.
 * `edges`: its vertex colours darken its edges (the river's banks in it).
 */
function skyWater(world, view, edges) {
  const sky = world.sky?.dome?.material?.uniforms;
  const uniforms = {
    uSkyHigh: sky?.uZenith ?? { value: new THREE.Color('#8fa7d0') }, uSkyLow: sky?.uHorizon ?? { value: new THREE.Color('#f2c6a8') },
    uSkyBand: sky?.uFogColor ?? { value: new THREE.Color('#e6d2c8') }, uWarm: { value: new THREE.Color(WATER.colour) }, uWarmShare: { value: WATER.warm },
  };
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: edges });
  return view.patch(material, edges ? 'slope-river' : 'slope-water', shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying float vSkyUp;\n${shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n  vSkyUp = normalize( cameraPosition - ( modelMatrix * vec4( transformed, 1.0 ) ).xyz ).y;')}`;
    shader.fragmentShader = `${WATER_HEAD}\n${shader.fragmentShader.replace('#include <color_fragment>', WATER_COLOUR)}`;
  });
}
const WATER_HEAD = /* glsl */`
uniform vec3 uSkyHigh;
uniform vec3 uSkyLow;
uniform vec3 uSkyBand;
uniform vec3 uWarm;
uniform float uWarmShare;
varying float vSkyUp;`;
const WATER_COLOUR = /* glsl */`#include <color_fragment>
  vec3 skyThere = mix( uSkyLow, uSkyHigh, pow( clamp( vSkyUp, 0.0, 1.0 ), 0.4 ) );
  skyThere = mix( skyThere, uSkyBand, smoothstep( 0.09, 0.0, vSkyUp ) );
  diffuseColor.rgb *= mix( skyThere, uWarm, uWarmShare * ( 1.0 - smoothstep( 0.05, 0.5, vSkyUp ) ) );`;

// The river above the valley's (far-land.js UPPER: [x, z, level, half width]), from the mountains' foot to where route.river begins
const UPPER = [[-2250, 50, 56, 9], [-2050, 66, 54, 10], [-1850, 58, 52.5, 11], [-1680, 80, 51.5, 11]];
/** How far (x, z) is from UPPER's line. */
function upperFrom(x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < UPPER.length; i++) {
    const [ax, az] = UPPER[i], [bx, bz] = UPPER[i + 1], ex = bx - ax, ez = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * k, z - az - ez * k));
  }
  return best;
}
/** The river's water as one ribbon, wider than it is, a vertex every few metres along and five across, so that laid on the land
 * (draped over its banks where they rise over it) no crease of the far land's big triangles shows through it. */
function riverRibbon(route, from) {
  const STEP = 6, ACROSS = [-1, -0.5, 0, 0.5, 1];
  const points = [];
  for (let i = 0; i + 1 < UPPER.length; i++) {
    const [ax, az, al, ah] = UPPER[i], [bx, bz, bl, bh] = UPPER[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP);
    const l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
    for (let k = 0; k < n; k++) {
      const t = k / n, along = points.length * STEP;
      // a gentle bend each way in its broad, flat bottom (far-land.js: its banks slope 120 m out), none at its two ends
      const ends = smooth(along / 120) * (i === UPPER.length - 2 ? 1 - smooth((t - 0.7) / 0.3) : 1);
      const bend = WATER.meander[0] * Math.sin(along / WATER.meander[1]) * ends;
      points.push({ x: ax + (bx - ax) * t + nx * bend, z: az + (bz - az) * t + nz * bend, level: al + (bl - al) * t, half: ah + (bh - ah) * t });
    }
  }
  const { river } = route;
  for (let d = river.length; d >= 0; d -= STEP) { const r = river.at(d); points.push({ x: r.x, z: r.z, level: r.level, half: r.half }); }
  const positions = [], colours = [], index = [], W = ACROSS.length;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const far = smooth((Math.hypot(p.x - from[0], p.z - from[1]) - WATER.wide[0]) / (WATER.wide[1] - WATER.wide[0]));
    const nx = -dz / l, nz = dx / l, half = p.half * (1 + (WATER.widen - 1) * far) + WATER.more * far;
    for (const s of ACROSS) {
      positions.push(p.x + nx * half * s, p.level + WATER.rise, p.z + nz * half * s);
      const e = Math.abs(s) ** 2;
      colours.push(1 + (WATER.edge[0] - 1) * e, 1 + (WATER.edge[1] - 1) * e, 1 + (WATER.edge[2] - 1) * e);
    }
    if (i) for (let j = 0; j + 1 < W; j++) {
      const p0 = (i - 1) * W + j, p1 = i * W + j;
      index.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}
/** Lifts a flat water's vertices over the land where its banks rise over its level. */
function drape(geometry, landAt, over = 0.6) {
  const position = geometry.attributes.position;
  for (let v = 0; v < position.count; v++) position.setY(v, Math.max(position.getY(v), landAt(position.getX(v), position.getZ(v)) + over));
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
}

const HALO_VERTEX = /* glsl */`
uniform float uSize;
attribute vec2 aCorner;
varying vec2 vCorner;
void main() {
  vCorner = aCorner;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  mvPosition.xy += aCorner * uSize * 0.5;
  gl_Position = projectionMatrix * mvPosition;
}`;
const HALO_FRAGMENT = /* glsl */`
uniform vec3 uColour;
uniform float uLevel;
varying vec2 vCorner;
void main() {
  float d = dot(vCorner, vCorner);
  float light = exp(-d * 4.0) * 0.55 + exp(-d * 18.0) * 0.35;
  gl_FragColor = vec4(uColour * light * uLevel, 1.0);
}`;
/** Her glade's light: one soft lilac glow facing the camera over the glade (additive: it only lights what is behind it). */
function gladeHalo(far) {
  const y = far.heightAt(GLADE.x, GLADE.z) + GLADE.above;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => [GLADE.x, y, GLADE.z]).flat(), 3));
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(GLADE.x, y, GLADE.z), GLADE.size);
  const uniforms = { uColour: { value: new THREE.Vector3(...GLADE.colour) }, uLevel: { value: 0 }, uSize: { value: GLADE.size } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: HALO_VERTEX, fragmentShader: HALO_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  material.name = 'slope-glade-halo';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Slope view: her glade\'s light';
  mesh.renderOrder = 14;
  mesh.visible = false;
  return { mesh, uniforms, dispose() { geometry.dispose(); material.dispose(); } };
}
