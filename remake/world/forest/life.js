// Ambient forest and wetland wildlife (Skógarlíf): songbirds flitting between crowns, small lizards darting and looking up by
// rocks and ferns, beetles and snails on woodland logs, and — in wetlands (Síkið, Fenið, Hvítatré) — basking turtles stretching
// in the sun, frogs breathing and hopping across lily pads and banks with water rings, hovering dragonflies, and high-gliding
// flyers overhead.
//
// Built on its own seeded RNG (`createRng(seed, 'forest-life')`) so plant planning (`plan.js`) is untouched, and drawn through
// `createCrowds` with `inView: true`, `castShadow: false` (relying on the single instanced soft ground-shade pass) and single-LOD
// baked low-poly GLBs (`fugl`, `smaedla`, `froskur`, `skjaldbaka`, `snigill`, `bjalla`, `flugdyr`), keeping tablet cost to 3–6
// draw calls and ~2–4k triangles. Every pose is a pure function of game clock `time`.
import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { createCrowds } from '../critters/crowd.js';
import { clipPose, crowdModelFrom } from '../critters/crowd-models.js';
import { createRng, clamp, smoothstep } from './random.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = k => clamp(k, 0, 1);
const smooth = k => smoothstep(0, 1, k);
const lerpAngle = (a, b, k) => a + (((b - a + 540) % 360) - 180) * k;
const headingOf = (dx, dz) => Math.atan2(dz, dx) / DEG;

const ASSET_URLS = {
  bird: new URL('../../assets/critters/fugl.glb', import.meta.url).href,
  lizard: new URL('../../assets/critters/smaedla.glb', import.meta.url).href,
  frog: new URL('../../assets/critters/froskur.glb', import.meta.url).href,
  turtle: new URL('../../assets/critters/skjaldbaka.glb', import.meta.url).href,
  snail: new URL('../../assets/critters/snigill.glb', import.meta.url).href,
  beetle: new URL('../../assets/critters/bjalla.glb', import.meta.url).href,
  flyer: new URL('../../assets/critters/flugdyr.glb', import.meta.url).href,
};

const PROCEDURAL_KIND = {
  bird: 'bird',
  lizard: 'salamander',
  frog: 'frog',
  turtle: 'turtle',
  snail: 'snail',
  beetle: 'beetle',
  dragonfly: 'dragonfly',
  flyer: 'earlyBird',
};

// Shared parsed templates across places so each GLB is fetched and unpacked at most once per session.
const TEMPLATE_PROMISES = new Map(); // kind -> Promise<template | null>
const TEMPLATES = new Map(); // kind -> { geometry, pivot, height, wing, clips, map, color }

function cloneCrowdGeometry(source) {
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    if (name === 'aFlight') continue; // crowd.js attaches its own per-crowd InstancedBufferAttribute
    geo.setAttribute(name, attr.clone());
  }
  if (source.index) geo.setIndex(source.index.clone());
  if (source.morphAttributes.position) {
    geo.morphAttributes.position = source.morphAttributes.position.map(a => { const c = a.clone(); c.name = a.name; return c; });
  }
  if (source.morphAttributes.normal) {
    geo.morphAttributes.normal = source.morphAttributes.normal.map(a => { const c = a.clone(); c.name = a.name; return c; });
  }
  geo.morphTargetsRelative = source.morphTargetsRelative;
  geo.name = source.name;
  geo.boundingBox = source.boundingBox ? source.boundingBox.clone() : null;
  geo.boundingSphere = source.boundingSphere ? source.boundingSphere.clone() : null;
  return geo;
}

function fetchTemplate(world, kind) {
  const url = ASSET_URLS[kind];
  if (!url) return null;
  if (TEMPLATES.has(kind)) return Promise.resolve(TEMPLATES.get(kind));
  if (world.loadModel) {
    // Allow per-world test loaders (or cached game loader) to resolve
    return Promise.resolve(world.loadModel(url)).then(gltf => {
      if (!gltf) return null;
      const parsed = crowdModelFrom(gltf);
      if (parsed.lods[1]) parsed.lods[1].geometry.dispose();
      const tpl = {
        geometry: parsed.lods[0].geometry,
        pivot: parsed.pivot ?? 0,
        height: parsed.height,
        wing: parsed.wing ?? null,
        clips: parsed.clips ?? {},
        map: parsed.material?.map ?? null,
        color: parsed.material?.color ?? null,
      };
      TEMPLATES.set(kind, tpl);
      return tpl;
    }).catch(() => null);
  }
  if (typeof document === 'undefined') return null;
  if (!TEMPLATE_PROMISES.has(kind)) {
    TEMPLATE_PROMISES.set(kind, new GLTFLoader().loadAsync(url).then(gltf => {
      const parsed = crowdModelFrom(gltf);
      if (parsed.lods[1]) parsed.lods[1].geometry.dispose();
      const tpl = {
        geometry: parsed.lods[0].geometry,
        pivot: parsed.pivot ?? 0,
        height: parsed.height,
        wing: parsed.wing ?? null,
        clips: parsed.clips ?? {},
        map: parsed.material?.map ?? null,
        color: parsed.material?.color ?? null,
      };
      TEMPLATES.set(kind, tpl);
      return tpl;
    }).catch(() => {
      TEMPLATE_PROMISES.delete(kind);
      return null;
    }));
  }
  return TEMPLATE_PROMISES.get(kind);
}

const PERCH_SPECIES = new Set(['broadleaf', 'araucaria', 'treeFern', 'swampConifer', 'deadSnag', 'bush']);
const COVER_SPECIES = new Set(['rock', 'rockSmall', 'log', 'cycad', 'fern', 'mushroom', 'mossHummock']);

export function createForestLife(world, { layout, seed = 1, terrain, placements = [], water = null, q = { name: 'tablet' } } = {}) {
  const rng = createRng(seed, 'forest-life').next;
  const group = new THREE.Group();
  group.name = 'Forest life';

  const [cx, cz] = layout.clearing?.center ?? [0, 0];
  const clearR = layout.clearing?.radius ?? 10;
  const waterShape = water?.shape ?? layout.water?.shape ?? null;
  const waterLevel = water?.level ?? layout.water?.level ?? 0;
  const hasWater = Boolean(waterShape);
  const isTrail = !hasWater && layout.biome === 'fen' && Boolean(layout.blend);
  const low = q?.name === 'low';
  const countOf = n => (low ? Math.max(2, Math.round(n * 0.55)) : n);

  // Keep ambient critters comfortably clear of actors and static camera lenses so nothing clips into a character or lens.
  const keepClear = [];
  for (const actor of Object.values(layout.actors ?? {})) {
    if (Array.isArray(actor?.position)) keepClear.push([actor.position[0], actor.position[2], 2.2]);
  }
  for (const shot of Object.values(layout.shots ?? {})) {
    if (Array.isArray(shot?.position)) keepClear.push([shot.position[0], shot.position[2], 2.5]);
  }
  const isClear = (x, z, extra = 0) => {
    for (const [kx, kz, r] of keepClear) if (Math.hypot(x - kx, z - kz) < r + extra) return false;
    return true;
  };
  const plantNear = (x, z, minR) => {
    for (const p of placements) {
      if (p.name === 'waterLily' || p.name === 'mossClump' || p.name === 'mossHummock') continue;
      if (Math.hypot(p.x - x, p.z - z) < minR) return true;
    }
    return false;
  };

  // ---- 1. Songbird perches (forests, trails, and wetlands) ----------------------------------------------------------------
  const perches = [];
  for (const p of placements) {
    if (!PERCH_SPECIES.has(p.name)) continue;
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d < Math.max(4, clearR * 0.45) || d > 34) continue;
    if (!isClear(p.x, p.z, 0.8)) continue;
    const h = (p.model?.height ?? 3) * p.scale;
    const r = (p.model?.radius ?? 1.2) * p.scale;
    const py = p.y + (p.name === 'bush' ? h * 0.78 : clamp(h * 0.58, 1.8, 5.2));
    const ang = Math.atan2(cz - p.z, cx - p.x) + (rng() - 0.5) * 1.1; // facing inward toward the clearing
    const pr = p.name === 'bush' ? r * 0.35 : r * 0.52;
    perches.push({ x: p.x + Math.cos(ang) * pr, y: py, z: p.z + Math.sin(ang) * pr });
  }
  while (perches.length < 6) {
    const a = (perches.length / 6) * TAU + rng() * 0.4;
    const r = clearR + 2 + rng() * 5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    perches.push({ x, y: terrain.heightAt(x, z) + 2.2 + rng() * 1.6, z });
  }

  const birds = [];
  const birdCount = countOf(hasWater ? 7 : isTrail ? 7 : 8);
  for (let i = 0; i < birdCount; i++) {
    const ia = Math.floor(rng() * perches.length);
    let ib = (ia + 1 + Math.floor(rng() * Math.max(1, perches.length - 1))) % perches.length;
    for (let tries = 0; tries < 8; tries++) {
      const cand = Math.floor(rng() * perches.length);
      const dist = Math.hypot(perches[cand].x - perches[ia].x, perches[cand].z - perches[ia].z);
      if (cand !== ia && dist >= 5 && dist <= 22) { ib = cand; break; }
    }
    const a = perches[ia], b = perches[ib];
    birds.push({
      kind: 'bird',
      a: new THREE.Vector3(a.x, a.y, a.z),
      b: new THREE.Vector3(b.x, b.y, b.z),
      scale: 1.22 + rng() * 0.24,
      halfPeriod: 5.5 + rng() * 4.5,
      flySeconds: 1.9 + rng() * 0.8,
      arc: 0.8 + rng() * 1.1,
      phase: rng() * 40,
      restYawA: headingOf(cx - a.x, cz - a.z) + (rng() - 0.5) * 50,
      restYawB: headingOf(cx - b.x, cz - b.z) + (rng() - 0.5) * 50,
      pose: { wings: [0, 0], squash: [1, 1, 1], pitch: 0 },
      pos: new THREE.Vector3(),
    });
  }

  // ---- 2. Turtles, Frogs, Dragonflies & High Flyers (wetlands & damp trail) ------------------------------------------------
  const turtles = [];
  const frogs = [];
  const dragonflies = [];
  const flyers = [];
  const lizards = [];
  const crawlers = []; // beetles & snails in woodland clearings

  if (hasWater) {
    // Basking turtles on sunny dry banks, shore stones and shore logs right beside the pools & channel
    const turtleSpots = [];
    // Prefer shore rocks & logs first so turtles bask right by/beside stones & logs
    for (const p of placements) {
      if (p.name !== 'rock' && p.name !== 'rockSmall' && p.name !== 'log') continue;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d > 34) continue;
      const s = waterShape.signedAt(p.x, p.z);
      if (s < 0.15 || s > 2.4) continue;
      const ang = rng() * TAU;
      const tx = p.x + Math.cos(ang) * 0.65, tz = p.z + Math.sin(ang) * 0.65;
      const ts = waterShape.signedAt(tx, tz);
      if (ts >= 0.2 && ts <= 1.6 && isClear(tx, tz, 0.4) && !plantNear(tx, tz, 0.45)) turtleSpots.push([tx, tz]);
    }
    for (let tries = 0; tries < 260 && turtleSpots.length < 12; tries++) {
      const r = 3 + rng() * 29;
      const a = rng() * TAU;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = waterShape.signedAt(x, z);
      if (!(s >= 0.24 && s <= 1.35)) continue;
      if (!isClear(x, z, 0.4) || plantNear(x, z, 0.6)) continue;
      if (turtleSpots.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 3.4)) continue;
      turtleSpots.push([x, z]);
    }
    const turtleCount = Math.min(countOf(5), turtleSpots.length);
    for (let i = 0; i < turtleCount; i++) {
      const [x, z] = turtleSpots[i];
      const e = 0.35;
      const gx = waterShape.signedAt(x + e, z) - waterShape.signedAt(x - e, z);
      const gz = waterShape.signedAt(x, z + e) - waterShape.signedAt(x, z - e);
      // Face mostly toward/along the water so its head & shell silhouette read clearly
      const towardWater = headingOf(-gx, -gz) + (rng() - 0.5) * 65;
      const alongAngle = (towardWater + 80) * DEG;
      const bx = x + Math.cos(alongAngle) * 0.22, bz = z + Math.sin(alongAngle) * 0.22;
      const canCreep = waterShape.signedAt(bx, bz) >= 0.18;
      turtles.push({
        kind: 'turtle',
        a: new THREE.Vector3(x, terrain.heightAt(x, z), z),
        b: new THREE.Vector3(canCreep ? bx : x, terrain.heightAt(canCreep ? bx : x, canCreep ? bz : z), canCreep ? bz : z),
        heading: towardWater,
        scale: 1.65 + rng() * 0.25,
        phase: rng() * TAU,
        stretchPeriod: 7.5 + rng() * 5,
        pose: { morphs: {}, squash: [1, 1, 1], pitch: 0 },
        pos: new THREE.Vector3(),
      });
    }

    // Frogs on lily pads and wet banks, hopping between pads/shore with real water rings
    const pads = placements
      .filter(p => p.name === 'waterLily' && Math.hypot(p.x - cx, p.z - cz) < 32 && isClear(p.x, p.z))
      .map(p => ({ x: p.x, y: waterLevel + 0.015, z: p.z, wet: true }));
    const frogBanks = [];
    for (let tries = 0; tries < 200 && frogBanks.length < 10; tries++) {
      const r = 3 + rng() * 27, a = rng() * TAU;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = waterShape.signedAt(x, z);
      if (!(s >= 0.12 && s <= 0.65) || !isClear(x, z) || plantNear(x, z, 0.5)) continue;
      if (frogBanks.some(f => Math.hypot(f.x - x, f.z - z) < 2.2)) continue;
      frogBanks.push({ x, y: terrain.heightAt(x, z), z, wet: s < 0.35 });
    }
    const frogPool = [...pads, ...frogBanks];
    const frogCount = Math.min(countOf(8), Math.max(3, frogPool.length));
    for (let i = 0; i < frogCount && frogPool.length > 0; i++) {
      const spotA = frogPool[Math.floor((i * frogPool.length) / frogCount)];
      let spotB = null;
      for (const cand of frogPool) {
        const d = Math.hypot(cand.x - spotA.x, cand.z - spotA.z);
        if (d >= 0.55 && d <= 2.8) { spotB = cand; break; }
      }
      if (!spotB) {
        const ang = rng() * TAU, step = 0.75;
        const bx = spotA.x + Math.cos(ang) * step, bz = spotA.z + Math.sin(ang) * step;
        const bs = waterShape.signedAt(bx, bz);
        spotB = bs >= 0.08
          ? { x: bx, y: terrain.heightAt(bx, bz), z: bz, wet: bs < 0.35 }
          : { x: spotA.x + Math.cos(ang) * 0.24, y: spotA.y, z: spotA.z + Math.sin(ang) * 0.24, wet: spotA.wet };
      }
      frogs.push({
        kind: 'frog',
        a: new THREE.Vector3(spotA.x, spotA.y, spotA.z),
        b: new THREE.Vector3(spotB.x, spotB.y, spotB.z),
        wetA: spotA.wet,
        wetB: spotB.wet,
        heading: headingOf(spotB.x - spotA.x || Math.cos(i), spotB.z - spotA.z || Math.sin(i)),
        scale: 1.48 + rng() * 0.26,
        halfPeriod: 4.8 + rng() * 4.5,
        phase: rng() * 30,
        lastHopIdx: -1,
        pose: { morphs: {}, squash: [1, 1, 1], pitch: 0 },
        pos: new THREE.Vector3(),
      });
    }

    // Hovering & darting dragonflies over pools, lilies & reeds
    const flyCount = countOf(6);
    for (let i = 0; i < flyCount; i++) {
      let fx = cx, fz = cz;
      for (let tries = 0; tries < 60; tries++) {
        const r = 3 + rng() * 26, a = rng() * TAU;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (waterShape.signedAt(x, z) < 0.7 && isClear(x, z)) { fx = x; fz = z; break; }
      }
      const baseH = Math.max(waterLevel, terrain.heightAt(fx, fz)) + 0.42 + rng() * 0.48;
      const ang = rng() * TAU, dart = 1.4 + rng() * 1.5;
      dragonflies.push({
        kind: 'dragonfly',
        a: new THREE.Vector3(fx, baseH, fz),
        b: new THREE.Vector3(fx + Math.cos(ang) * dart, baseH + (rng() - 0.5) * 0.25, fz + Math.sin(ang) * dart),
        scale: 1.4 + rng() * 0.25,
        halfPeriod: 3.4 + rng() * 2.8,
        phase: rng() * 25,
        pose: { morphs: { hover: 1 }, wings: [0, 1], pitch: 0 },
        pos: new THREE.Vector3(),
      });
    }

    // Distant high-soaring flyers (`flugdyr.glb`) wheeling lazily high over the open wetland sky
    const highCount = low ? 1 : 2;
    for (let i = 0; i < highCount; i++) {
      flyers.push({
        kind: 'flyer',
        cx: cx + (i === 0 ? -12 : 16),
        cz: cz + (i === 0 ? -14 : 10),
        radius: 22 + i * 6,
        altitude: 21 + i * 4.5,
        speed: (i % 2 === 0 ? 1 : -1) * (0.11 + rng() * 0.03), // rad/s: ~52 s per full lazy circle
        scale: 1.65 + rng() * 0.25,
        phase: rng() * TAU,
        pose: { morphs: {}, wings: [0, 1], pitch: 0 },
        pos: new THREE.Vector3(),
      });
    }
  } else {
    // Woodland glade or Fenjaslóð trail: scurrying/looking small lizards (`smaedla.glb`) around edge rocks, ferns & logs
    const lizardAnchors = [];
    for (const p of placements) {
      if (!COVER_SPECIES.has(p.name)) continue;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < Math.max(3.5, clearR * 0.42) || d > 24) continue;
      if (!isClear(p.x, p.z, 0.5)) continue;
      const ang = Math.atan2(cz - p.z, cx - p.x) + (rng() - 0.5) * 1.4;
      const lx = p.x + Math.cos(ang) * 0.85, lz = p.z + Math.sin(ang) * 0.85;
      if (!isClear(lx, lz, 0.3) || plantNear(lx, lz, 0.42)) continue;
      if (lizardAnchors.some(([ox, oz]) => Math.hypot(ox - lx, oz - lz) < 3.2)) continue;
      lizardAnchors.push([lx, lz]);
    }
    while (lizardAnchors.length < 6) {
      const a = rng() * TAU, r = clearR * 0.72 + rng() * 5;
      const lx = cx + Math.cos(a) * r, lz = cz + Math.sin(a) * r;
      if (isClear(lx, lz, 0.3)) lizardAnchors.push([lx, lz]);
      else lizardAnchors.push([cx + Math.cos(a) * (r + 3), cz + Math.sin(a) * (r + 3)]);
    }
    const lizCount = countOf(isTrail ? 5 : 5);
    for (let i = 0; i < lizCount; i++) {
      const [ax, az] = lizardAnchors[i % lizardAnchors.length];
      const ang = headingOf(cx - ax, cz - az) * DEG + (rng() > 0.5 ? 1.15 : -1.15);
      const runDist = 1.6 + rng() * 1.2;
      let bx = ax + Math.cos(ang) * runDist, bz = az + Math.sin(ang) * runDist;
      if (!isClear(bx, bz, 0.2) || plantNear(bx, bz, 0.38)) {
        bx = ax + Math.cos(ang + Math.PI) * 1.2;
        bz = az + Math.sin(ang + Math.PI) * 1.2;
      }
      lizards.push({
        kind: 'lizard',
        a: new THREE.Vector3(ax, terrain.heightAt(ax, az), az),
        b: new THREE.Vector3(bx, terrain.heightAt(bx, bz), bz),
        dist: Math.hypot(bx - ax, bz - az) || 0.01,
        bakedScale: 0.85 + rng() * 0.2,
        procScale: 2.1 + rng() * 0.35,
        halfPeriod: 6.2 + rng() * 4.5,
        runSeconds: 0.95 + rng() * 0.35,
        phase: rng() * 35,
        pose: { morphs: {}, squash: [1, 1, 1], pitch: 0 },
        pos: new THREE.Vector3(),
      });
    }

    if (isTrail) {
      // On Fenjaslóð, add damp-ground frogs hopping near the hummocks (keeping total species = 3 + 1 shade <= 4 draw calls!)
      const trailFrogs = countOf(5);
      for (let i = 0; i < trailFrogs; i++) {
        let fx = cx + (rng() - 0.5) * 16, fz = cz + (rng() - 0.5) * 16;
        for (let tries = 0; tries < 50; tries++) {
          const r = 4 + rng() * 18, a = rng() * TAU;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (isClear(x, z, 0.5) && !plantNear(x, z, 0.45)) { fx = x; fz = z; break; }
        }
        const ang = rng() * TAU;
        const bx = fx + Math.cos(ang) * 0.8, bz = fz + Math.sin(ang) * 0.8;
        frogs.push({
          kind: 'frog',
          a: new THREE.Vector3(fx, terrain.heightAt(fx, fz), fz),
          b: new THREE.Vector3(bx, terrain.heightAt(bx, bz), bz),
          wetA: false,
          wetB: false,
          heading: headingOf(bx - fx, bz - fz),
          scale: 1.45 + rng() * 0.25,
          halfPeriod: 5.5 + rng() * 4.5,
          phase: rng() * 30,
          lastHopIdx: -1,
          pose: { morphs: {}, squash: [1, 1, 1], pitch: 0 },
          pos: new THREE.Vector3(),
        });
      }
    } else {
      // In woodland clearings (Rjóður, Burknalaut), add slow beetles and snails near logs, mushrooms & stones (seen <= 20 m)
      const crawlCount = countOf(3);
      for (const kind of ['beetle', 'snail']) {
        for (let i = 0; i < crawlCount; i++) {
          let sx = cx + 6, sz = cz + 6;
          for (let tries = 0; tries < 50; tries++) {
            const p = placements[Math.floor(rng() * Math.max(1, placements.length))];
            if (p && COVER_SPECIES.has(p.name)) {
              const d = Math.hypot(p.x - cx, p.z - cz);
              if (d >= 3.5 && d <= 16) {
                const a = rng() * TAU;
                const x = p.x + Math.cos(a) * 0.55, z = p.z + Math.sin(a) * 0.55;
                if (isClear(x, z, 0.2)) { sx = x; sz = z; break; }
              }
            }
            const r = 4 + rng() * 11, a = rng() * TAU;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            if (isClear(x, z, 0.3) && !plantNear(x, z, 0.35)) { sx = x; sz = z; break; }
          }
          const ang = rng() * TAU;
          const span = kind === 'beetle' ? 0.55 : 0.28;
          const bx = sx + Math.cos(ang) * span, bz = sz + Math.sin(ang) * span;
          crawlers.push({
            kind,
            a: new THREE.Vector3(sx, terrain.heightAt(sx, sz), sz),
            b: new THREE.Vector3(bx, terrain.heightAt(bx, bz), bz),
            heading: headingOf(bx - sx, bz - sz),
            scale: 1.32 + rng() * 0.22,
            halfPeriod: kind === 'beetle' ? 6.5 + rng() * 3.5 : 11 + rng() * 5,
            phase: rng() * TAU,
            pose: { morphs: {}, squash: [1, 1, 1], pitch: 0 },
            pos: new THREE.Vector3(),
          });
        }
      }
    }
  }

  // ---- 3. Crowd reservation & seamless baked-GLB upgrade -----------------------------------------------------------------
  const counts = new Map();
  const register = (kind, list) => { if (list.length) counts.set(kind, (counts.get(kind) ?? 0) + list.length); };
  register('bird', birds);
  register('turtle', turtles);
  register('frog', frogs);
  register('dragonfly', dragonflies);
  register('flyer', flyers);
  register('lizard', lizards);
  for (const c of crawlers) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);

  const REACH = { bird: 38, turtle: 45, frog: 36, dragonfly: 34, flyer: 130, lizard: 30, beetle: 20, snail: 20 };

  let disposed = false;
  let lastTime = -1;
  const activeBaked = new Map(); // kind -> template
  const ownedMaterials = [];

  function buildCrowdSet(templatesByKind) {
    const c = createCrowds(world, {
      parent: group,
      seen: 46,
      inView: true,
      castShadow: false,
      groundAt: terrain.heightAt,
    });
    for (const [kind, n] of counts) {
      const tpl = templatesByKind.get(kind) ?? null;
      if (tpl) {
        let material = null;
        if (tpl.map) {
          material = new THREE.MeshLambertMaterial({ map: tpl.map, color: tpl.color ?? 0xffffff });
          ownedMaterials.push(material);
        }
        c.reserve(kind, n, {
          lods: [{ geometry: cloneCrowdGeometry(tpl.geometry), until: Infinity }],
          pivot: tpl.pivot,
          height: tpl.height,
          wing: tpl.wing,
          material,
          seen: REACH[kind],
          castShadow: false,
        });
      } else {
        c.reserve(PROCEDURAL_KIND[kind], n, { seen: REACH[kind], castShadow: false });
      }
    }
    c.ready();
    return c;
  }

  for (const kind of counts.keys()) {
    if (TEMPLATES.has(kind)) activeBaked.set(kind, TEMPLATES.get(kind));
  }
  let crowds = buildCrowdSet(activeBaked);

  // Fetch any not-yet-cached baked GLBs in the background and swap cleanly once ready
  const pending = [];
  for (const kind of counts.keys()) {
    if (activeBaked.has(kind) || !ASSET_URLS[kind]) continue;
    const req = fetchTemplate(world, kind);
    if (req) pending.push(req.then(tpl => [kind, tpl]));
  }
  const loaded = pending.length
    ? Promise.all(pending).then(entries => {
      if (disposed) return false;
      let added = false;
      for (const [kind, tpl] of entries) {
        if (tpl) { activeBaked.set(kind, tpl); added = true; }
      }
      if (!added) return false;
      const old = crowds;
      crowds = buildCrowdSet(activeBaked);
      old.dispose();
      return true;
    })
    : Promise.resolve(activeBaked.size > 0);

  // ---- 4. Pure game-clock pose updates -----------------------------------------------------------------------------------
  const camPos = new THREE.Vector3();

  function stepBirds(time) {
    const placeKind = activeBaked.has('bird') ? 'bird' : PROCEDURAL_KIND.bird;
    for (const b of birds) {
      const cycle = b.halfPeriod * 2;
      const u = ((time + b.phase) % cycle + cycle) % cycle;
      const leg = u < b.halfPeriod ? 0 : 1;
      const local = leg === 0 ? u : u - b.halfPeriod;
      const from = leg === 0 ? b.a : b.b;
      const to = leg === 0 ? b.b : b.a;
      const restFrom = leg === 0 ? b.restYawA : b.restYawB;
      const restTo = leg === 0 ? b.restYawB : b.restYawA;
      if (local < b.flySeconds) {
        const k = local / b.flySeconds;
        const s = smooth(k);
        b.pos.lerpVectors(from, to, s);
        const dx = to.x - from.x, dz = to.z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        const sway = 0.35 * Math.sin(Math.PI * k) * Math.sin(k * TAU * 1.5 + b.phase);
        b.pos.x += (-dz / len) * sway;
        b.pos.z += (dx / len) * sway;
        b.pos.y += b.arc * 4 * k * (1 - k);
        const flyYaw = headingOf(dx, dz);
        const yaw = k < 0.15 ? lerpAngle(restFrom, flyYaw, smooth(k / 0.15))
          : k > 0.85 ? lerpAngle(flyYaw, restTo, smooth((k - 0.85) / 0.15))
            : flyYaw;
        const unfold = smooth(Math.min(k / 0.12, (1 - k) / 0.14));
        b.pose.wings[0] = 0.15 + 0.85 * Math.sin(TAU * 6.4 * time + b.phase);
        b.pose.wings[1] = unfold;
        b.pose.pitch = clamp(0.32 * (1 - 2 * k) * unfold, -0.35, 0.35);
        b.pose.squash[1] = 1;
        crowds.place(placeKind, b.pos, yaw, b.scale, b.pose);
      } else {
        b.pos.copy(to);
        const idleT = local - b.flySeconds;
        const look = Math.sin(idleT * 1.9 + b.phase) * Math.max(0, Math.sin(idleT * 0.63 + b.phase * 0.5));
        const hop = Math.max(0, Math.sin(idleT * 2.4 + b.phase * 1.3)) ** 12;
        b.pos.y += 0.04 * hop;
        b.pose.wings[0] = 0;
        b.pose.wings[1] = 0;
        b.pose.pitch = -0.05 * look;
        b.pose.squash[1] = 1 + 0.025 * Math.sin(TAU * 0.9 * time + b.phase);
        crowds.place(placeKind, b.pos, restTo + 24 * look, b.scale, b.pose);
      }
    }
  }

  function stepTurtles(time) {
    const tpl = activeBaked.get('turtle');
    const placeKind = tpl ? 'turtle' : PROCEDURAL_KIND.turtle;
    for (const t of turtles) {
      const creep = 0.5 + 0.5 * Math.sin((TAU * time) / 22 + t.phase);
      t.pos.lerpVectors(t.a, t.b, creep);
      t.pos.y = terrain.heightAt(t.pos.x, t.pos.z);
      const stretch = Math.max(0, Math.sin((TAU * time) / t.stretchPeriod + t.phase)) ** 2;
      const lookWave = Math.sin((TAU * time) / 6.2 + t.phase * 1.7);
      const look = Math.max(0, Math.abs(lookWave) - 0.25) / 0.75;
      for (const k in t.pose.morphs) t.pose.morphs[k] = 0;
      if (tpl) {
        t.pose.morphs.stretch = 0.85 * stretch;
        t.pose.morphs.look = 0.65 * look * (1 - 0.4 * stretch);
        t.pose.morphs.hide = 0;
      } else {
        t.pose.morphs.hide = -0.55 * stretch;
      }
      t.pose.squash[1] = 1 + 0.02 * Math.sin(TAU * 0.45 * time + t.phase);
      const yaw = t.heading + 15 * lookWave;
      crowds.place(placeKind, t.pos, yaw, t.scale, t.pose);
    }
  }

  function stepFrogs(time, forwardStep) {
    const tpl = activeBaked.get('frog');
    const placeKind = tpl ? 'frog' : PROCEDURAL_KIND.frog;
    for (const f of frogs) {
      const cycle = f.halfPeriod * 2;
      const total = Math.max(0, time + f.phase);
      const hopIdx = Math.floor(total / f.halfPeriod);
      const local = total - hopIdx * f.halfPeriod;
      const leg = hopIdx % 2;
      const from = leg === 0 ? f.a : f.b;
      const to = leg === 0 ? f.b : f.a;
      const crouchDur = 0.22, airDur = 0.52, settleDur = 0.22;
      for (const k in f.pose.morphs) f.pose.morphs[k] = 0;

      const moving = from.distanceToSquared(to) > 0.01;
      let yaw = moving ? headingOf(to.x - from.x, to.z - from.z) : f.heading;

      if (moving && local < crouchDur) {
        f.pos.copy(from);
        const k = smooth(local / crouchDur);
        if (tpl) f.pose.morphs.crouch = k;
        else { f.pose.squash[1] = 1 - 0.2 * k; f.pose.squash[0] = 1 + 0.1 * k; }
      } else if (moving && local < crouchDur + airDur) {
        const a = (local - crouchDur) / airDur;
        f.pos.lerpVectors(from, to, smooth(a));
        const groundY = leg === 0 && f.wetA && f.wetB ? waterLevel + 0.015 : Math.max(terrain.heightAt(f.pos.x, f.pos.z), f.pos.y);
        f.pos.y = groundY + 0.34 * 4 * a * (1 - a);
        const leapW = Math.sin(Math.PI * a);
        f.pose.morphs.leap = leapW;
        f.pose.pitch = 0.35 * (1 - 2 * a);
        if (forwardStep && water?.rippleAt && f.lastHopIdx !== hopIdx) {
          f.lastHopIdx = hopIdx;
          if ((leg === 0 ? f.wetA : f.wetB) && camPos.distanceToSquared(from) < 28 * 28) {
            water.rippleAt(from, 0.32);
          }
        }
      } else {
        f.pos.copy(moving ? to : from);
        yaw = moving ? headingOf(from.x - to.x, from.z - to.z) : f.heading + 12 * Math.sin(time * 0.4 + f.phase);
        const after = local - (crouchDur + airDur);
        const landW = moving && after < settleDur ? 1 - smooth(after / settleDur) : 0;
        if (tpl) {
          f.pose.morphs.crouch = 0.65 * landW;
          const pulse = 0.5 + 0.5 * Math.sin(TAU * 0.9 * time + f.phase);
          const puff = Math.max(0, Math.sin(TAU * 0.23 * time + f.phase * 0.7)) ** 3;
          f.pose.morphs.breathe = (1 - landW) * (0.35 * pulse + 0.65 * puff);
        }
        f.pose.pitch = 0;
        f.pose.squash[0] = 1; f.pose.squash[1] = 1;
      }
      crowds.place(placeKind, f.pos, yaw, f.scale, f.pose);
    }
  }

  function stepDragonflies(time) {
    for (const d of dragonflies) {
      const cycle = d.halfPeriod * 2;
      const u = ((time + d.phase) % cycle + cycle) % cycle;
      const leg = u < d.halfPeriod ? 0 : 1;
      const local = leg === 0 ? u : u - d.halfPeriod;
      const from = leg === 0 ? d.a : d.b;
      const to = leg === 0 ? d.b : d.a;
      const dartDur = 0.55;
      const k = local < dartDur ? smooth(local / dartDur) : 1;
      d.pos.lerpVectors(from, to, k);
      d.pos.x += 0.16 * Math.sin(time * 1.4 + d.phase);
      d.pos.y += 0.08 * Math.sin(time * 2.3 + d.phase * 1.7);
      d.pos.z += 0.16 * Math.cos(time * 1.1 + d.phase);
      d.pose.wings[0] = 0.12 + 0.65 * Math.sin(TAU * 11 * time + d.phase);
      d.pose.wings[1] = 1;
      const yaw = headingOf(to.x - from.x, to.z - from.z) + 18 * Math.sin(time * 0.7 + d.phase);
      crowds.place('dragonfly', d.pos, yaw, d.scale, d.pose);
    }
  }

  function stepFlyers(time) {
    const tpl = activeBaked.get('flyer');
    const placeKind = tpl ? 'flyer' : PROCEDURAL_KIND.flyer;
    for (const fl of flyers) {
      const a = time * fl.speed + fl.phase;
      fl.pos.set(
        fl.cx + Math.cos(a) * fl.radius,
        fl.altitude + 1.1 * Math.sin(a * 2 + fl.phase),
        fl.cz + Math.sin(a) * fl.radius,
      );
      const vx = -Math.sin(a) * fl.speed * fl.radius;
      const vz = Math.cos(a) * fl.speed * fl.radius;
      const yaw = headingOf(vx, vz);
      for (const k in fl.pose.morphs) fl.pose.morphs[k] = 0;
      if (tpl?.clips?.glide && tpl?.clips?.flap) {
        const beatWindow = smooth(((time * 0.22 + fl.phase) % 1) / 0.12) * (1 - smooth((((time * 0.22 + fl.phase) % 1) - 0.22) / 0.12));
        const gPose = clipPose(tpl, 'glide', time, fl.phase);
        const fPose = clipPose(tpl, 'flap', time, fl.phase);
        for (const [m, w] of Object.entries(gPose)) fl.pose.morphs[m] = (fl.pose.morphs[m] ?? 0) + w * (1 - beatWindow);
        for (const [m, w] of Object.entries(fPose)) fl.pose.morphs[m] = (fl.pose.morphs[m] ?? 0) + w * beatWindow;
      } else {
        fl.pose.wings[0] = 0.25 * Math.sin(TAU * 2.2 * time + fl.phase);
        fl.pose.wings[1] = 1;
      }
      crowds.place(placeKind, fl.pos, yaw, fl.scale, fl.pose);
    }
  }

  function stepLizards(time) {
    const tpl = activeBaked.get('lizard');
    const placeKind = tpl ? 'lizard' : PROCEDURAL_KIND.lizard;
    for (const l of lizards) {
      const cycle = l.halfPeriod * 2;
      const u = ((time + l.phase) % cycle + cycle) % cycle;
      const leg = u < l.halfPeriod ? 0 : 1;
      const local = leg === 0 ? u : u - l.halfPeriod;
      const from = leg === 0 ? l.a : l.b;
      const to = leg === 0 ? l.b : l.a;
      const running = local < l.runSeconds ? Math.sin(Math.PI * (local / l.runSeconds)) : 0;
      const progress = local < l.runSeconds ? smooth(local / l.runSeconds) : 1;
      l.pos.lerpVectors(from, to, progress);
      l.pos.y = terrain.heightAt(l.pos.x, l.pos.z);

      let yaw = local < l.runSeconds ? headingOf(to.x - from.x, to.z - from.z) : headingOf(cx - l.pos.x, cz - l.pos.z);
      let nearActor = 0;
      for (const actor of world.actors?.values?.() ?? []) {
        if (!actor?.root?.visible) continue;
        const d = Math.hypot(actor.root.position.x - l.pos.x, actor.root.position.z - l.pos.z);
        if (d < 5.8) {
          nearActor = Math.max(nearActor, smooth((5.8 - d) / 2.5));
          if (local >= l.runSeconds) yaw = lerpAngle(yaw, headingOf(actor.root.position.x - l.pos.x, actor.root.position.z - l.pos.z), nearActor * 0.8);
        }
      }

      for (const k in l.pose.morphs) l.pose.morphs[k] = 0;
      if (tpl?.clips?.idle && tpl?.clips?.run && tpl?.clips?.look) {
        const lookW = (1 - running) * Math.max(nearActor, smooth(1.4 * Math.sin((TAU * time) / 7.5 + l.phase) - 0.35));
        const idleW = (1 - running) * (1 - lookW);
        if (idleW > 0) {
          const p = clipPose(tpl, 'idle', time, l.phase * 0.1);
          for (const [m, w] of Object.entries(p)) l.pose.morphs[m] = (l.pose.morphs[m] ?? 0) + w * idleW;
        }
        if (lookW > 0) {
          const lookHold = (5 / tpl.clips.look.frames) * tpl.clips.look.seconds;
          const p = clipPose(tpl, 'look', lookHold, 0);
          for (const [m, w] of Object.entries(p)) l.pose.morphs[m] = (l.pose.morphs[m] ?? 0) + w * lookW;
        }
        if (running > 0) {
          const travelled = progress * l.dist;
          const p = clipPose(tpl, 'run', (travelled / 0.55) * tpl.clips.run.seconds, l.phase * 0.1);
          for (const [m, w] of Object.entries(p)) l.pose.morphs[m] = (l.pose.morphs[m] ?? 0) + w * running;
        }
        crowds.place(placeKind, l.pos, yaw, l.bakedScale, l.pose);
      } else {
        const step = Math.sin(progress * l.dist * 10);
        l.pose.morphs.curl = 0.4 * (0.5 + 0.5 * Math.sin(time * 1.4 + l.phase)) * (1 - running);
        l.pose.morphs.walkA = running * Math.max(0, step);
        l.pose.morphs.walkB = running * Math.max(0, -step);
        crowds.place(placeKind, l.pos, yaw, l.procScale, l.pose);
      }
    }
  }

  function stepCrawlers(time) {
    for (const c of crawlers) {
      const tpl = activeBaked.get(c.kind);
      const placeKind = tpl ? c.kind : PROCEDURAL_KIND[c.kind];
      const wave = 0.5 - 0.5 * Math.cos((TAU * time) / (c.halfPeriod * 2) + c.phase);
      c.pos.lerpVectors(c.a, c.b, wave);
      c.pos.y = terrain.heightAt(c.pos.x, c.pos.z);
      const dirSign = Math.sin((TAU * time) / (c.halfPeriod * 2) + c.phase) >= 0 ? 0 : 180;
      for (const k in c.pose.morphs) c.pose.morphs[k] = 0;
      if (c.kind === 'beetle') {
        const leg = 0.5 + 0.5 * Math.sin(TAU * 3.2 * time + c.phase);
        c.pose.morphs.kickA = 0.65 * leg;
        c.pose.morphs.kickB = 0.65 * (1 - leg);
      } else if (tpl) {
        c.pose.morphs.sway = 0.5 + 0.5 * Math.sin((TAU * time) / 4.2 + c.phase);
      }
      crowds.place(placeKind, c.pos, c.heading + dirSign, c.scale, c.pose);
    }
  }

  function update(dt, time = 0) {
    if (disposed || !group.visible) return;
    const forwardStep = lastTime >= 0 && time >= lastTime && time - lastTime < 0.25;
    lastTime = time;
    if (world.camera) world.camera.getWorldPosition(camPos);
    crowds.begin(world.camera ?? null);
    if (birds.length) stepBirds(time);
    if (turtles.length) stepTurtles(time);
    if (frogs.length) stepFrogs(time, forwardStep);
    if (dragonflies.length) stepDragonflies(time);
    if (flyers.length) stepFlyers(time);
    if (lizards.length) stepLizards(time);
    if (crawlers.length) stepCrawlers(time);
    crowds.end();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    crowds.dispose();
    for (const mat of ownedMaterials) mat.dispose();
    group.removeFromParent();
  }

  return {
    group,
    loaded,
    update,
    dispose,
    get crowds() { return crowds; },
    counts: Object.fromEntries(counts),
  };
}
