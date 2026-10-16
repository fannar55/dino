// The species registry. Each kind builds a few procedural variants in local space (base at the
// origin, +X is the side that faces the clearing when the planner cares). A variant is a model:
//   { solid, thin, height, radius, trunk, crown: { c: [x, y, z], r } }
// where `solid` holds closed opaque parts (trunks, lobes, rocks) and `thin` holds double-sided
// parts (fronds, petals, needles). The planner only uses names, footprints and bounds, so a kind
// can later be replaced by a loaded GLB that returns the same shape of model.
import { FOREST, PALETTE, BEAT_SHARE, WIND_PEAK } from './config.js';
import { createRng, createNoise, clamp, smoothstep, lerp } from './random.js';
import {
  MeshBuilder, srgb, mix3, mul3, tint3, norm3, add3, sub3, madd3, cross3,
  addBlob, addTube, addFrond, addLeafletFrond, addRibbonFrond, addFlowerHead, makeBumps,
} from './geometry.js';

const C = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, srgb(v)]));
const DEG = Math.PI / 180;
const SWAY = FOREST.wind.maxSwayDeg * DEG; // radians at full wind

/** Bend weight for a point at height y in a plant of height H (quadratic, metres of sway). */
const bendAt = (y, H, k = 1) => Math.max(0, SWAY * k * (y * y) / Math.max(H, 0.5));

// Fronds, stems and stalks bend by weights of their own: a lean, the metres of sway per metre of the part's length (or height),
// where bendAt's trunks and crowns lean SWAY at most. The beat adds BEAT_SHARE of whatever a part sways, so a part that leans more
// than SWAY would pass the style guide's 3 degrees with it. Every part that does is baked FIT times smaller, which makes its peak
// lean with the beat the very peak it had before the beat: the beat takes a share of its sway instead of adding to it. (FIT is the
// wind shader's peak without the beat over its peak with it; tests/forest-sway.test.mjs holds every kind to the rule.)
const FIT = Math.hypot(WIND_PEAK.along, WIND_PEAK.side) / Math.hypot(WIND_PEAK.along + BEAT_SHARE, WIND_PEAK.side);
const LEAN = {
  cycad: 0.08 * FIT, // fronds
  fern: 0.05 * FIT, // fronds
  flower: 0.05 * FIT, // stems and heads
  horsetail: 0.06 * FIT, // stalks, which bend with the square of their height
  treeFern: 0.12 * FIT, // fronds, beyond the trunk top they ride on
  bush: 0.025, // lobes and berries: under SWAY already
};

function jitterColor(c, rng, amount = 0.06) {
  const k = 1 + rng.range(-amount, amount);
  return [clamp(c[0] * k * (1 + rng.range(-0.03, 0.03)), 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k * (1 + rng.range(-0.05, 0.05)), 0, 1)];
}

// ---------------------------------------------------------------------------------------------
// Bark colouring shared by trunks, limbs and roots.
function barkColor(noise, salt, base = C.bark) {
  return (t, ang, p, n) => {
    const ridge = 0.5 + 0.5 * Math.sin(ang * 9 + p[1] * 0.9 + noise.noise(p[1] * 0.6, ang * 2, salt) * 4);
    let c = mix3(C.barkCrevice, base, smoothstep(0.15, 0.6, ridge));
    c = mix3(c, C.barkHighlight, smoothstep(0.78, 1, ridge) * 0.55);
    const blot = noise.noise(p[0] * 1.3 + ang, p[1] * 1.1, salt + 5);
    c = mul3(c, 0.88 + 0.24 * blot);
    // moss on upward faces and around the base, patchy
    const up = n ? n[1] : 0;
    const patch = noise.noise(p[0] * 1.1 + 3, p[2] * 1.1 + p[1] * 0.8, salt + 9);
    const mossy = smoothstep(0.4, 0.85, up) * 0.85 * smoothstep(0.45, 0.7, patch);
    c = mix3(c, mul3(mix3(C.barkMoss, C.barkCrevice, 0.3), 0.9 + 0.2 * blot), mossy * 0.8);
    return c;
  };
}

// Foliage colouring for lobes: darker and bluer inside and below, warmer at the sunlit top.
function foliageColor(lobeTint, crownC, crownR, noise, salt, palette = {}) {
  const dark = palette.dark || [0.17, 0.34, 0.27];
  const mid = palette.mid || [0.29, 0.47, 0.30];
  const light = palette.light || [0.50, 0.66, 0.31];
  return (p, n, d, bump = 0.08) => {
    const rel = sub3(p, crownC);
    const up = clamp(rel[1] / crownR[1], -1, 1);
    const out = clamp(Math.hypot(rel[0] / crownR[0], rel[1] / crownR[1], rel[2] / crownR[2]), 0, 1.4);
    let f = clamp(0.4 + 0.36 * up + 0.32 * (out - 0.7) + 0.16 * n[1] + 1.2 * (bump - 0.08), 0, 1);
    let c = f < 0.5 ? mix3(dark, mid, f / 0.5) : mix3(mid, light, (f - 0.5) / 0.5);
    const mottle = noise.noise3(p[0] * 1.7, p[1] * 1.7, p[2] * 1.7, salt);
    c = mul3(c, 0.86 + 0.28 * mottle);
    return [clamp(c[0] * lobeTint[0], 0, 1), clamp(c[1] * lobeTint[1], 0, 1), clamp(c[2] * lobeTint[2], 0, 1)];
  };
}

// ---------------------------------------------------------------------------------------------
// Every builder draws its random numbers in an order that does not depend on the level of detail
// (parts take their own forked streams), so the LOD versions of one variant are the same plant
// with fewer triangles, and switching between them at a distance does not change its shape.

// Broadleaf: the big characterful tree. Thick flared trunk, a few curving limbs, and a crown of a
// few big puffy clumps with scalloped (cauliflower) outlines that reaches toward +X (the clearing)
// for edge trees. `size` below 1 makes the medium trees of the understory.
function buildBroadleaf(rng, { lod, noise, reach = 0.6, size = 1 }) {
  const solid = new MeshBuilder();
  const H = rng.range(11.5, 16.5) * size;
  const r0 = rng.range(0.42, 0.6) * (H / 15) * (size < 0.8 ? 0.9 : 1);
  const forkH = H * rng.range(0.26, 0.44);
  const salt = rng.int(0, 999);
  const leanX = reach * rng.range(0.4, 1.3) * size * (rng.chance(0.2) ? 2.2 : 1);
  const leanZ = rng.range(-0.5, 0.5) * size;
  const buttress = rng.int(4, 6);
  const bPhase = rng.angle();
  const sx = rng.range(-0.35, 0.35) * size, sz = rng.range(-0.35, 0.35) * size;
  const crownY = rng.range(0.55, 0.7);
  const crownRx = rng.range(0.33, 0.41), crownRy = rng.range(0.21, 0.26), crownRz = rng.range(0.31, 0.38);
  const limbCount = rng.int(3, 4);
  const a0 = rng.angle();
  const tintChoice = rng.int(0, 3);
  const tintJitter = [rng.range(0, 1), rng.range(0, 1), rng.range(0, 1)];
  const radial = lod === 0 ? 11 : lod === 1 ? 8 : 6;

  // trunk spine with a gentle S-curve and a lean toward the clearing
  const baseYs = (lod === 0 ? [-0.45, 0, 0.22, 0.5, 0.9, 1.45] : lod === 1 ? [-0.4, 0.1, 0.5, 1.2] : [-0.4, 0.3, 1.4]).map(y => y * Math.max(0.6, size));
  const upper = lod === 0 ? 4 : lod === 1 ? 3 : 2;
  const last = baseYs[baseYs.length - 1];
  const ys = [...baseYs];
  for (let i = 1; i <= upper; i++) ys.push(last + (forkH - last) * (i / upper));
  const spine = ys.map(y => {
    const u = clamp(y / forkH, 0, 1);
    return [leanX * u * u * 0.8 + sx * Math.sin(u * Math.PI), y, leanZ * u * u * 0.6 + sz * Math.sin(u * Math.PI)];
  });
  const trunkR = y => r0 * (1 - 0.32 * clamp(y / forkH, 0, 1));
  const bark = barkColor(noise, salt);
  addTube(solid, {
    points: spine, radial,
    radius: (t, ang, i) => {
      const y = spine[i][1];
      const yp = Math.max(y, 0) / Math.max(0.6, size);
      const flare = 1 + 1.15 * Math.exp(-yp / 0.7);
      const butt = 1 + 0.42 * Math.exp(-yp / 1.0) * Math.pow(Math.max(0, Math.cos(buttress * ang + bPhase)), 3);
      const ridge = 1 + 0.03 * Math.sin(ang * 13 + y * 1.4);
      return trunkR(y) * flare * butt * ridge;
    },
    color: bark,
    sway: p => bendAt(p[1], H),
    exposure: p => 0.1 + 0.2 * clamp(p[1] / H, 0, 1),
  });

  // crown envelope: low and wide, so the trees frame the clearing with foliage, not poles
  const crownC = [leanX * 1.25 + reach * H * 0.08, H * crownY, leanZ * 1.1];
  const crownR = [H * crownRx * (1 + reach * 0.12), H * crownRy, H * crownRz];
  const meanR = (crownR[0] + crownR[1] + crownR[2]) / 3;
  const top = spine[spine.length - 1];

  // limbs from the fork into the crown (the far LOD keeps the first two)
  const limbsUsed = lod === 2 ? Math.min(2, limbCount) : limbCount;
  const clumps = [];
  for (let k = 0; k < limbCount; k++) {
    const lr = rng.fork(`limb${k}`);
    const az = a0 + (k / limbCount) * Math.PI * 2 + lr.range(-0.35, 0.35);
    const el = lr.range(0.5, 0.9);
    const L = H * lr.range(0.27, 0.36);
    const drop = lr.range(0, 0.6) * size;
    const aimY = lr.range(-0.25, 0.2);
    const rStartK = lr.range(0.55, 0.68);
    const clumpR = lr.range(0.5, 0.6);
    if (k >= limbsUsed) continue;
    const start = [top[0], top[1] - drop, top[2]];
    const dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
    const aim = [crownC[0] + Math.cos(az) * crownR[0] * 0.62, crownC[1] + crownR[1] * aimY, crownC[2] + Math.sin(az) * crownR[2] * 0.62];
    const n = lod === 0 ? 6 : 4;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push(mix3(madd3(start, dir, L * t), aim, t * t * 0.85));
    }
    const rStart = trunkR(top[1]) * rStartK;
    addTube(solid, {
      points: pts, radial: lod === 0 ? 7 : lod === 1 ? 5 : 4,
      radius: t => rStart * (1 - 0.78 * t) * (1 + 0.25 * Math.exp(-t * 8)),
      color: bark, sway: p => bendAt(p[1], H), exposure: () => 0.3,
    });
    const e = pts[n - 1];
    clumps.push({ c: [e[0], e[1] + meanR * 0.12, e[2]], r: clumpR, key: `clump${k}` });
  }
  {
    const lr = rng.fork('leader');
    const jx = lr.range(-0.3, 0.3), jz = lr.range(-0.3, 0.3);
    const pts = [top, add3(top, [leanX * 0.2, H * 0.12, 0]), add3(top, [leanX * 0.35 + jx, H * 0.24, jz])];
    addTube(solid, { points: pts, radial: lod === 0 ? 7 : 5, radius: t => trunkR(top[1]) * 0.6 * (1 - 0.7 * t), color: bark, sway: p => bendAt(p[1], H), exposure: () => 0.3 });
  }
  // surface roots
  if (lod === 0 && size > 0.8) {
    for (let k = 0; k < buttress; k++) {
      const rr = rng.fork(`root${k}`);
      const az = (k / buttress) * Math.PI * 2 - bPhase / buttress + rr.range(-0.1, 0.1);
      const len = r0 * rr.range(3.2, 4.8);
      const dx = Math.cos(az), dz = Math.sin(az);
      const pts = [[dx * r0 * 0.7, 0.55, dz * r0 * 0.7], [dx * r0 * 1.6, 0.18, dz * r0 * 1.6], [dx * len * 0.65, 0.0, dz * len * 0.65], [dx * len, -0.22, dz * len]];
      addTube(solid, { points: pts, radial: 5, radius: t => r0 * 0.42 * (1 - 0.75 * t), color: bark, exposure: () => 0.25 });
    }
  }

  // the crown: a few big clumps, each with a scalloped outline (a separate cull piece)
  solid.mark();
  {
    const tr = rng.fork('top0');
    const az = tr.angle(), y = tr.range(0.35, 0.55), r = tr.range(0.55, 0.64);
    clumps.push({ c: [crownC[0] + Math.cos(az) * crownR[0] * 0.25, crownC[1] + crownR[1] * y, crownC[2] + Math.sin(az) * crownR[2] * 0.25], r, key: 'top0c', top: true });
  }
  if (lod < 2) clumps.push({ c: [crownC[0], crownC[1] - crownR[1] * 0.15, crownC[2]], r: 0.55, core: true, key: 'core' });
  const tints = [
    [1.04 + 0.08 * tintJitter[0], 1.02 + 0.06 * tintJitter[1], 0.78 + 0.12 * tintJitter[2]], // warm, yellow-green
    [0.94 + 0.1 * tintJitter[0], 0.97 + 0.06 * tintJitter[1], 0.92 + 0.12 * tintJitter[2]], // the canopy green
    [0.94 + 0.1 * tintJitter[1], 0.97 + 0.06 * tintJitter[2], 0.92 + 0.12 * tintJitter[0]],
    [0.8 + 0.08 * tintJitter[0], 0.88 + 0.07 * tintJitter[1], 1.0 + 0.12 * tintJitter[2]], // cool, dark blue-green
  ];
  const crownTint = tints[tintChoice];
  const big = size >= 0.8;
  const detail = lod === 0 ? (big ? 3 : 2) : lod === 1 ? 2 : 1;
  const bumpCount = lod === 0 ? (big ? 18 : 13) : lod === 1 ? 12 : 6;
  const bumpRadius = lod === 0 ? (big ? 0.56 : 0.6) : lod === 1 ? 0.62 : 0.75;
  const bumpHeight = lod === 2 ? 0.2 : 0.15;
  for (const { c, r, core, key, top } of clumps) {
    const cr = rng.fork(key);
    const R = meanR * r;
    const tint = mix3(crownTint, [cr.range(0.93, 1.07), cr.range(0.95, 1.05), cr.range(0.9, 1.1)], 0.5);
    const radii = [R * cr.range(1.0, 1.15), R * cr.range(0.8, 0.92), R * cr.range(1.0, 1.15)];
    const lumpSalt = cr.range(0, 50);
    addBlob(solid, {
      center: c, radii, detail: core ? 1 : top && detail === 3 && clumps.length > 5 ? 2 : detail,
      lump: 0.05, lumpFreq: 2.4, noise3: noise.noise3, salt: lumpSalt,
      bumps: core ? null : makeBumps(rng.fork(`${key}bumps`), bumpCount, { radius: bumpRadius, height: bumpHeight, minY: -0.3 }),
      crease: 0.05, bumpSoft: 0.55,
      bendCenter: crownC, bend: 0.38, flatBottom: 0.4,
      color: foliageColor(tint, crownC, crownR, noise, salt),
      sway: p => bendAt(p[1], H),
      flutter: (p, d) => 0.25 * clamp(0.4 + 0.6 * Math.abs(d[1]), 0, 1),
      leaf: 0.85,
      exposure: (p, n) => clamp(0.4 + 0.45 * ((p[1] - crownC[1]) / crownR[1]) + 0.25 * n[1], 0.2, 1),
    });
  }
  return {
    solid, thin: null, height: crownC[1] + crownR[1],
    radius: r0 * 1.6, trunk: { r: r0, flare: r0 * 2.2, top: forkH },
    crown: { c: crownC, r: Math.max(crownR[0], crownR[2]) * 1.08, ry: crownR[1] * 1.15 },
  };
}

// ---------------------------------------------------------------------------------------------
// Araucaria-like conifer: a tall straight trunk carrying whorls of drooping, fluffy branches in
// its upper part. Each whorl is 5 to 7 branches radiating from the trunk; alternate whorls turn,
// whorl counts and spacing vary, a branch or a whorl is sometimes missing, so trunk and sky show
// between them. Seen far away it reads as a tiered spire, up close as tufted arms.
function buildAraucaria(rng, { lod, noise }) {
  const solid = new MeshBuilder();
  const H = rng.range(14, 23);
  const r0 = rng.range(0.27, 0.38);
  const salt = rng.int(0, 999);
  const bend = [rng.range(-0.6, 0.6), rng.range(-0.6, 0.6)];
  const crownStart = H * rng.range(0.45, 0.6);
  const tierCount = rng.int(5, 9);
  const maxLen = rng.range(2.3, 3.3);
  const droopK = rng.range(0.25, 0.5);
  const shape = rng.pick(['dome', 'cone', 'umbrella']);
  const dark = jitterColor(C.conifer, rng, 0.06);
  const tip = jitterColor(C.coniferTip, rng, 0.06);
  const n = lod === 0 ? 9 : lod === 1 ? 6 : 4;
  const spine = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    spine.push([bend[0] * t * t, -0.4 + (H + 0.4) * t, bend[1] * t * t]);
  }
  const barkBase = mix3(C.bark, C.rockMid, 0.25);
  const bark = barkColor(noise, salt, barkBase);
  const trunkAt = y => { const tf = y / H; return [bend[0] * tf * tf, bend[1] * tf * tf]; };
  addTube(solid, {
    points: spine, radial: lod === 0 ? 8 : lod === 1 ? 6 : 4,
    radius: t => {
      const y = t * H;
      return r0 * (1 - 0.82 * t) * (1 + 0.7 * Math.exp(-Math.max(y, 0) / 0.6));
    },
    color: (t, ang, p, nn) => {
      const c = bark(t, ang, p, nn);
      const ring = 0.5 + 0.5 * Math.sin(p[1] * 5.5 + noise.noise(ang * 2, p[1], salt) * 2);
      return mul3(c, 0.85 + 0.2 * ring);
    },
    sway: p => bendAt(p[1], H, 0.8),
    exposure: p => 0.1 + 0.4 * clamp(p[1] / H, 0, 1),
  });
  // tier heights: uneven spacing between crownStart and the top
  const tiers = [];
  let acc = 0;
  const gaps = [];
  for (let k = 0; k < tierCount; k++) { const g = rng.fork(`gap${k}`).range(0.7, 1.3); gaps.push(g); if (k < tierCount - 1) acc += g; }
  let y = crownStart;
  for (let k = 0; k < tierCount; k++) {
    tiers.push(y);
    y += ((H - 0.9 - crownStart) * gaps[k]) / acc; // the top whorl sits just under the leader
  }
  const golden = 2.399963;
  const crownC = [bend[0] * 0.8, (crownStart + H) / 2, bend[1] * 0.8];
  solid.mark(); // the whorls are culled apart from the trunk
  tiers.forEach((ty, k) => {
    const tr = rng.fork(`tier${k}`);
    const u = k / Math.max(1, tierCount - 1); // 0 bottom whorl, 1 top whorl
    const branches = tr.int(5, 7);
    const broken = tr.chance(0.18); // a whorl with gaps
    const rot = k * golden + tr.range(-0.3, 0.3);
    let profile;
    if (shape === 'cone') profile = 1 - 0.75 * u;
    else if (shape === 'umbrella') profile = 0.55 + 0.45 * Math.sin(Math.PI * clamp(0.2 + u * 0.95, 0, 1));
    else profile = (0.55 + 0.45 * Math.sin(Math.PI * clamp(0.3 + (1 - u) * 0.7, 0, 1))) * (1 - 0.4 * u);
    const L0 = maxLen * profile;
    const [tx, tz] = trunkAt(ty);
    const fine = lod === 0 && k === 0;
    for (let b = 0; b < branches; b++) {
      const br = tr.fork(`b${b}`);
      const az = rot + (b / branches) * Math.PI * 2 + br.range(-0.25, 0.25);
      const L = L0 * br.range(0.8, 1.15);
      const droop = L * droopK * br.range(0.8, 1.25);
      const thick = br.range(0.36, 0.46) * (0.75 + 0.25 * L / maxLen);
      const wide = br.range(0.5, 0.66) * (0.75 + 0.25 * L / maxLen);
      const lumpSalt = br.range(0, 50);
      if (broken && br.chance(0.4)) continue;
      // the far level keeps every other branch, a little fuller
      if (lod === 2 && b % 2 === 1) continue;
      const dx = Math.cos(az), dz = Math.sin(az);
      const half = L * 0.52;
      const cxB = tx + dx * (L * 0.5), czB = tz + dz * (L * 0.5);
      const grow = lod === 2 ? 1.3 : 1;
      // a fat, drooping, tufted lobe from the trunk out to the branch tip
      addBlob(solid, {
        center: [0, 0, 0], radii: [half, thick * grow, wide * grow], detail: lod === 2 ? 0 : fine ? 2 : 1,
        lump: 0.1, lumpFreq: 2.4, noise3: noise.noise3, salt: lumpSalt,
        bumps: lod === 2 ? null : makeBumps(tr.fork(`b${b}bumps`), fine ? 12 : 7, { radius: fine ? 0.5 : 0.65, height: 0.24, minY: -0.6 }),
        crease: 0.07, bumpSoft: 0, bend: 0.15, bendCenter: [tx, ty - 0.8, tz], flatBottom: 0.25,
        warp: p => {
          const t = clamp((p[0] / half + 1) / 2, 0, 1); // 0 at the trunk, 1 at the tip
          const y = p[1] - droop * t * t + 0.16 * L * Math.pow(t, 5);
          return [cxB + p[0] * dx - p[2] * dz, ty + y, czB + p[0] * dz + p[2] * dx];
        },
        color: (p, nn, d, bump = 0.08) => {
          const t = clamp((d[0] + 1) / 2, 0, 1);
          const f = clamp(0.2 + 0.45 * t + 0.3 * clamp(nn[1], -1, 1) + 1.2 * (bump - 0.08), 0, 1);
          return mul3(mix3(mul3(dark, 0.8), tip, f), 0.9 + 0.2 * noise.noise(p[0] * 2.3, p[2] * 2.3 + p[1], salt));
        },
        sway: p => bendAt(p[1], H, 0.8),
        flutter: (p, d) => 0.15 * clamp((d[0] + 1) / 2, 0, 1),
        leaf: 0.6,
        exposure: (p, nn) => clamp(0.4 + 0.55 * nn[1] + 0.2 * u, 0.2, 1),
      });
    }
  });
  // the leader tuft
  const [tx, tz] = trunkAt(H);
  addBlob(solid, {
    center: [tx, H - 0.05, tz], radii: [0.4, 0.75, 0.4], detail: 1, lump: 0.12, noise3: noise.noise3, salt: 3,
    color: (p, nn, d) => mix3(dark, tip, 0.35 + 0.4 * d[1]), sway: p => bendAt(p[1], H, 0.8), leaf: 0.5, exposure: () => 1,
  });
  return {
    solid, thin: null, height: H + 1.2, radius: r0 * 1.5, trunk: { r: r0, flare: r0 * 1.7, top: crownStart },
    crown: { c: crownC, r: maxLen * 1.05, ry: (H - crownStart) / 2 + 0.8 },
  };
}

// ---------------------------------------------------------------------------------------------
// Tree fern: a slim fibrous trunk with a crown of arching fronds.
function frondColor(base, rng, noise, salt) {
  const b = jitterColor(base, rng, 0.07);
  const dark = mul3(tint3(b, 0.85, 0.9, 1.05), 0.72);
  const light = tint3(b, 1.12, 1.1, 0.95);
  return (t, edge, p) => {
    let c = mix3(dark, b, smoothstep(0.0, 0.35, t));
    c = mix3(c, light, smoothstep(0.45, 1, t) * 0.7);
    if (edge > 0) c = mix3(c, light, 0.15);
    else if (edge < 0) c = mul3(tint3(c, 0.95, 0.92, 0.85), 0.8);
    return mul3(c, 0.92 + 0.16 * noise.noise(p[0] * 3 + salt, p[2] * 3));
  };
}

function buildTreeFern(rng, { lod, noise }) {
  const solid = new MeshBuilder();
  const thin = new MeshBuilder();
  const H = rng.range(1.7, 3.6);
  const r = rng.range(0.14, 0.21);
  const salt = rng.int(0, 999);
  const bx = rng.range(-0.4, 0.4), bz = rng.range(-0.4, 0.4);
  const fronds = rng.int(9, 12);
  const a0 = rng.angle();
  const colour = frondColor(C.fern, rng.fork('colour'), noise, salt);
  const spine = [];
  const n = lod === 0 ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    spine.push([bx * Math.sin(t * 1.6), -0.25 + (H + 0.25) * t, bz * Math.sin(t * 1.6)]);
  }
  addTube(solid, {
    points: spine, radial: lod === 0 ? 7 : 5,
    radius: t => r * (1 + 0.55 * Math.exp(-t * 7)) * (1 + 0.12 * Math.sin(t * 40)),
    color: (t, ang, p) => {
      const lump = noise.noise(ang * 2.5, p[1] * 5, salt);
      let c = mix3(C.barkCrevice, mix3(C.bark, C.soilDark, 0.4), smoothstep(0.3, 0.75, lump));
      return mix3(c, C.barkMoss, smoothstep(0.7, 0.1, p[1]) * 0.5);
    },
    sway: p => bendAt(p[1], H),
    exposure: () => 0.3,
    capEnd: true,
  });
  const top = spine[n - 1];
  const topSway = bendAt(H, H);
  for (let k = 0; k < fronds; k++) {
    const fr = rng.fork(`frond${k}`);
    const az = a0 + (k / fronds) * Math.PI * 2 + fr.range(-0.2, 0.2);
    const rise = fr.range(0.35, 0.95);
    const length = fr.range(1.5, 2.5) * Math.pow(H / 2.6, 0.25);
    const width = fr.range(0.3, 0.4), arch = fr.range(0.25, 0.42), droop = fr.range(0.5, 0.8);
    if (lod === 2 && k % 2) continue;
    const dir = norm3([Math.cos(az), rise, Math.sin(az)]);
    addRibbonFrond(thin, {
      base: add3(top, [Math.cos(az) * r * 0.6, 0.05, Math.sin(az) * r * 0.6]), dir, length,
      width: width * (lod === 2 ? 0.95 : 0.85), arch, droop,
      leaflets: lod === 0 ? 6 : lod === 1 ? 5 : 3, samples: lod === 0 ? 3 : 2, notch: lod === 2 ? 0.55 : 0.45, forward: 0.5, fold: 0.22,
      color: colour,
      sway: (p, t) => topSway + LEAN.treeFern * t * length,
      flutter: (p, t) => 0.35 * t,
      exposure: (p, t) => 0.6 + 0.4 * t,
    });
  }
  return { solid, thin, height: H + 0.6, radius: 0.5, trunk: { r, flare: r * 1.6, top: H }, crown: { c: [top[0], H, top[2]], r: 2.0, ry: 1.0 } };
}

// ---------------------------------------------------------------------------------------------
// Cycad: a stout patterned trunk with a crown of stiff palm-like leaves.
function buildCycad(rng, { lod, noise }) {
  const solid = new MeshBuilder();
  const thin = new MeshBuilder();
  const H = rng.range(0.35, 1.3);
  const r = rng.range(0.24, 0.36);
  const salt = rng.int(0, 999);
  const leaves = rng.int(16, 22);
  const a0 = rng.angle();
  const colour = frondColor(C.cycad, rng.fork('colour'), noise, salt);
  const n = lod === 0 ? 6 : 4;
  const spine = [];
  for (let i = 0; i < n; i++) spine.push([0, -0.2 + (H + 0.2) * (i / (n - 1)), 0]);
  const scaleDark = mix3(C.barkCrevice, C.soilDark, 0.4);
  const scaleLight = mix3(C.bark, C.soil, 0.45);
  addTube(solid, {
    points: spine, radial: lod === 0 ? 9 : 6,
    radius: t => r * (1 + 0.12 * Math.sin(Math.PI * t)) * (1 - 0.15 * t * t),
    color: (t, ang, p) => {
      const u = (ang / (Math.PI * 2)) * 6, v = p[1] * 2.6;
      const d1 = Math.abs((((u + v) % 1) + 1) % 1 - 0.5), d2 = Math.abs((((u - v) % 1) + 1) % 1 - 0.5);
      const line = smoothstep(0.08, 0.2, Math.min(d1, d2));
      return mix3(scaleDark, scaleLight, line * (0.8 + 0.2 * noise.noise(u, v, salt)));
    },
    exposure: () => 0.4,
    capEnd: true, capBulge: r * 0.35,
    capColor: () => mul3(C.cycad, 0.55),
  });
  for (let k = 0; k < leaves; k++) {
    const lr = rng.fork(`leaf${k}`);
    const az = a0 + k * 2.399963 + lr.range(-0.1, 0.1);
    const inner = k >= leaves - 5; // the last few stand up in the middle and fill the crown
    const rise = inner ? lr.range(1.8, 3.2) : lr.range(0.45, 1.3);
    const length = inner ? lr.range(0.7, 1.1) : lr.range(1.1, 1.85);
    const width = lr.range(0.15, 0.2), arch = lr.range(0.4, 0.6), droop = inner ? lr.range(0.1, 0.2) : lr.range(0.25, 0.45);
    if (lod === 1 && k % 2 && !inner) continue;
    if (lod === 2 && k % 3) continue;
    addRibbonFrond(thin, {
      base: [Math.cos(az) * r * 0.5, H + 0.05, Math.sin(az) * r * 0.5], dir: norm3([Math.cos(az), rise, Math.sin(az)]), length,
      width, arch, droop,
      leaflets: lod === 0 ? 9 : lod === 1 ? 5 : 4, samples: lod === 0 ? 3 : 2, notch: 0.4, forward: 0.65, fold: 0.3,
      color: colour, sway: (p, t) => LEAN.cycad * t * length, flutter: (p, t) => 0.25 * t, exposure: () => 0.85,
    });
  }
  return { solid, thin, height: H + 1.3, radius: 0.9, trunk: { r, flare: r, top: H }, crown: { c: [0, H + 0.6, 0], r: 1.5, ry: 0.8 } };
}

// ---------------------------------------------------------------------------------------------
// Ground fern: a rosette of arching fronds.
function buildFern(rng, { lod, noise }) {
  const thin = new MeshBuilder();
  const salt = rng.int(0, 999);
  const count = rng.int(7, 11);
  const size = rng.range(0.6, 1.25);
  const base = rng.chance(0.3) ? C.clover : C.fern;
  const a0 = rng.angle();
  const colour = frondColor(mix3(base, C.fern, 0.5), rng.fork('colour'), noise, salt);
  for (let k = 0; k < count; k++) {
    const fr = rng.fork(`frond${k}`);
    const az = a0 + (k / count) * Math.PI * 2 + fr.range(-0.25, 0.25);
    const rise = fr.range(0.7, 1.6);
    const length = size * fr.range(0.75, 1.1);
    const width = length * fr.range(0.19, 0.24), arch = fr.range(0.4, 0.6), droop = fr.range(0.5, 0.8);
    if (lod === 1 && k % 2) continue;
    if (lod === 2 && k % 3) continue;
    addRibbonFrond(thin, {
      base: [Math.cos(az) * 0.05, 0.0, Math.sin(az) * 0.05], dir: norm3([Math.cos(az), rise, Math.sin(az)]), length,
      width: width * (lod === 0 ? 0.85 : 1.05), arch, droop,
      leaflets: lod === 0 ? 5 : lod === 1 ? 4 : 3, samples: 2, notch: lod === 2 ? 0.6 : 0.45, forward: 0.5, fold: 0.25,
      color: colour, sway: (p, t) => LEAN.fern * t * length, flutter: (p, t) => 0.3 * t, exposure: (p, t) => 0.55 + 0.45 * t,
    });
  }
  return { solid: null, thin, height: size * 0.75, radius: size * 0.7, crown: { c: [0, size * 0.35, 0], r: size * 0.85, ry: size * 0.4 } };
}

// ---------------------------------------------------------------------------------------------
// Bush: a few soft lobes, sometimes with berries. The coarser LODs keep the biggest lobes.
function buildBush(rng, { lod, noise, fine = false }) {
  const solid = new MeshBuilder();
  const salt = rng.int(0, 999);
  const R = rng.range(0.75, 1.35);
  // a few shapes and colours, so the forest edge is not a row of identical domes
  const form = rng.pick(['dome', 'dome', 'tall', 'wide', 'clumpy']);
  const paletteName = rng.pick(['bluish', 'green', 'green', 'yellow']);
  const lobeCount = form === 'clumpy' ? rng.int(6, 8) : rng.int(4, 6);
  const extra = rng.next(); // berries, blossoms or plain
  const formK = { dome: [1, 0.8, 1], tall: [0.78, 1.35, 0.78], wide: [1.3, 0.62, 1.25], clumpy: [1.1, 0.85, 1.1] }[form];
  const centre = [0, R * 0.62 * formK[1], 0];
  const radii = [R * formK[0], R * rng.range(0.7, 0.9) * formK[1], R * formK[2]];
  const palette = {
    bluish: { dark: [0.09, 0.2, 0.19], mid: [0.16, 0.31, 0.27], light: [0.3, 0.45, 0.32] },
    green: { dark: [0.11, 0.24, 0.18], mid: [0.2, 0.36, 0.23], light: [0.36, 0.5, 0.27] },
    yellow: { dark: [0.15, 0.25, 0.13], mid: [0.28, 0.4, 0.17], light: [0.48, 0.56, 0.24] },
  }[paletteName];
  const lobes = [];
  for (let k = 0; k < lobeCount; k++) {
    const lr = rng.fork(`lobe${k}`);
    const az = lr.angle();
    const spread = form === 'wide' ? 0.75 : form === 'tall' ? 0.3 : 0.55;
    const d = [Math.cos(az) * lr.range(0.2, spread), lr.range(-0.15, form === 'tall' ? 0.9 : 0.45), Math.sin(az) * lr.range(0.2, spread)];
    const size = form === 'clumpy' ? lr.range(0.38, 0.55) : lr.range(0.5, 0.68);
    lobes.push({ k, c: [centre[0] + d[0] * R * formK[0], centre[1] + d[1] * R * 0.7 * formK[1], centre[2] + d[2] * R * formK[2]], r: R * size, salt: lr.range(0, 40) });
  }
  lobes.sort((a, b) => b.r - a.r);
  const used = lod === 0 ? lobes : lobes.slice(0, lod === 1 ? 3 : 2);
  for (const [li, lobe] of used.entries()) {
    const r = lobe.r * (lod === 0 ? 1 : 1.08);
    addBlob(solid, {
      center: lobe.c, radii: [r * 1.05, r * 0.85 * (form === 'tall' ? 1.15 : 1), r * 1.05], detail: fine && li < 3 ? 2 : 1, lump: 0.06, lumpFreq: 2.2, noise3: noise.noise3, salt: lobe.salt,
      bumps: lod === 2 ? null : makeBumps(rng.fork(`lobe${lobe.k}bumps`), fine ? 10 : lod === 0 ? 6 : 4, { radius: fine ? 0.55 : 0.72, height: 0.2, minY: -0.2 }), crease: 0.06, bumpSoft: 0.55,
      bendCenter: centre, bend: 0.3, flatBottom: 0.6,
      color: foliageColor([1, 1, 1], centre, radii, noise, salt, palette),
      sway: p => LEAN.bush * p[1], flutter: () => 0.15, leaf: 0.8,
      exposure: (p, n) => clamp(0.5 + 0.5 * n[1], 0.3, 1),
    });
  }
  if (lod === 0 && extra < 0.6) {
    // a few red berries, or small cream blossoms
    const blossoms = extra < 0.25;
    const br = rng.fork('berries');
    const count = blossoms ? br.int(8, 13) : br.int(5, 9);
    for (let k = 0; k < count; k++) {
      const az = br.angle(), el = br.range(-0.05, 0.85);
      const d = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const p = [centre[0] + d[0] * radii[0] * 0.98, centre[1] + d[1] * radii[1] * 0.98, centre[2] + d[2] * radii[2] * 0.98];
      const col = blossoms ? jitterColor(C.white, br, 0.04) : jitterColor(C.berries, br, 0.08);
      const size = blossoms ? 0.065 : 0.055;
      addBlob(solid, { center: p, radii: [size, blossoms ? size * 0.55 : size, size], detail: 0, color: () => col, sway: q => LEAN.bush * q[1], leaf: 0.2, exposure: () => 0.95 });
    }
  }
  return { solid, thin: null, height: R * 1.5 * formK[1], radius: R * 0.9 * Math.max(formK[0], formK[2]), crown: { c: centre, r: R * 1.1 * Math.max(formK[0], formK[2]), ry: R * 0.8 * formK[1] } };
}

// ---------------------------------------------------------------------------------------------
// Horsetails: a clump of jointed stalks with little needle whorls.
function buildHorsetail(rng, { lod, noise }) {
  const solid = new MeshBuilder();
  const thin = new MeshBuilder();
  const stalks = rng.int(7, 13);
  const green = jitterColor(C.horsetail, rng, 0.06);
  const node = mul3(tint3(green, 0.7, 0.75, 0.8), 0.6);
  for (let k = 0; k < stalks; k++) {
    const sr = rng.fork(`stalk${k}`);
    const az = sr.angle(), rr = sr.range(0, 0.32);
    const h = sr.range(0.5, 1.25);
    const lean = [sr.range(-0.12, 0.12), sr.range(-0.12, 0.12)];
    const rad = sr.range(0.02, 0.03);
    if (lod > 0 && k % 2) continue;
    const x = Math.cos(az) * rr, z = Math.sin(az) * rr;
    const segs = lod === 0 ? 8 : 4;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push([x + lean[0] * t * t * h, -0.05 + (h + 0.05) * t, z + lean[1] * t * t * h]);
    }
    addTube(solid, {
      points: pts, radial: lod === 0 ? 4 : 3,
      radius: t => rad * (1 - 0.55 * t),
      color: (t) => {
        const i = Math.round(t * segs);
        return i % 2 === 0 && i > 0 ? node : green;
      },
      sway: p => LEAN.horsetail * p[1] * p[1], flutter: (p, t) => 0.05 * t, leaf: 0.4, exposure: () => 0.7,
    });
    if (lod === 0) {
      for (const tw of [0.35, 0.6]) {
        const c = pts[Math.round(tw * segs)];
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * Math.PI * 2 + k;
          const d = [Math.cos(a), -0.35, Math.sin(a)];
          const tipP = madd3(c, d, 0.09);
          const side = norm3(cross3(d, [0, 1, 0]));
          const nn = [0, 1, 0];
          const sw = LEAN.horsetail * c[1] * c[1];
          const i0 = thin.vertex(madd3(c, side, 0.008), nn, green, sw, 0.01, 0.5, 0.7);
          const i1 = thin.vertex(madd3(c, side, -0.008), nn, green, sw, 0.01, 0.5, 0.7);
          const i2 = thin.vertex(tipP, nn, mul3(green, 1.1), sw, 0.02, 0.5, 0.7);
          thin.triFacing(i0, i1, i2);
        }
      }
    }
  }
  return { solid, thin, height: 1.2, radius: 0.45, crown: { c: [0, 0.6, 0], r: 0.6, ry: 0.6 } };
}

// ---------------------------------------------------------------------------------------------
// Flowers: a cluster of 3 to 7 blooms of one colour, with a few basal leaves.
const FLOWER_COLOURS = ['buttercup', 'buttercup', 'white', 'pink', 'coral', 'buttercup', 'white', 'violet'];
function buildFlowers(rng, { lod, noise, variant = 0 }) {
  const thin = new MeshBuilder();
  const name = FLOWER_COLOURS[variant % FLOWER_COLOURS.length];
  const petal = C[name];
  const centreC = name === 'buttercup' ? mix3(C.buttercup, C.coral, 0.45) : mix3(C.buttercup, C.litterB, 0.3);
  const leafC = jitterColor(C.clover, rng, 0.06);
  const count = rng.int(3, 7);
  for (let k = 0; k < count; k++) {
    const az = rng.angle(), rr = rng.range(0.03, 0.34);
    const x = Math.cos(az) * rr, z = Math.sin(az) * rr;
    const h = rng.range(0.2, 0.42);
    const lean = [rng.range(-0.08, 0.08), rng.range(-0.08, 0.08)];
    const top = [x + lean[0], h, z + lean[1]];
    addTube(thin, {
      points: [[x, -0.02, z], [x + lean[0] * 0.3, h * 0.5, z + lean[1] * 0.3], top], radial: 3,
      radius: () => 0.009, color: () => mul3(leafC, 0.85), sway: p => LEAN.flower * p[1], flutter: (p, t) => 0.02 * t, leaf: 0.5, exposure: () => 1,
    });
    addFlowerHead(thin, {
      center: top, normal: norm3([lean[0] * 4 + rng.range(-0.4, 0.4), 1, lean[1] * 4 + rng.range(-0.4, 0.4)]),
      radius: rng.range(0.06, 0.09), petals: name === 'violet' ? 4 : 5, rot: rng.angle(),
      petalColor: jitterColor(petal, rng, 0.04), centerColor: centreC, sway: LEAN.flower * h,
    });
  }
  const leaves = lod === 0 ? rng.int(3, 5) : 2;
  for (let k = 0; k < leaves; k++) {
    const az = rng.angle();
    addFrond(thin, {
      base: [Math.cos(az) * 0.03, 0, Math.sin(az) * 0.03], dir: norm3([Math.cos(az), 0.9, Math.sin(az)]), length: rng.range(0.14, 0.24),
      width: 0.035, arch: 0.4, droop: 0.4, segments: 3, serration: 0, fold: 0.2,
      color: () => leafC, sway: () => 0.004, flutter: (p, t) => 0.02 * t, exposure: () => 1,
    });
  }
  return { solid: null, thin, height: 0.4, radius: 0.4, crown: { c: [0, 0.2, 0], r: 0.4, ry: 0.2 }, colour: name };
}

// ---------------------------------------------------------------------------------------------
// Mushrooms: red caps with pale spots on cream stems.
function buildMushrooms(rng, { lod, noise }) {
  const solid = new MeshBuilder();
  const count = rng.int(2, 5);
  for (let k = 0; k < count; k++) {
    const az = rng.angle(), rr = k === 0 ? 0 : rng.range(0.08, 0.28);
    const x = Math.cos(az) * rr, z = Math.sin(az) * rr;
    const scale = k === 0 ? 1 : rng.range(0.5, 0.85);
    const h = rng.range(0.09, 0.17) * scale;
    const sr = rng.range(0.02, 0.03) * scale;
    const cr = rng.range(0.07, 0.1) * scale;
    const tilt = [rng.range(-0.15, 0.15), rng.range(-0.15, 0.15)];
    addTube(solid, {
      points: [[x, -0.02, z], [x + tilt[0] * h * 0.4, h * 0.5, z + tilt[1] * h * 0.4], [x + tilt[0] * h, h, z + tilt[1] * h]], radial: 6,
      radius: t => sr * (1.15 - 0.3 * t), color: t => mix3(mul3(C.mushroomStem, 0.85), C.mushroomStem, t), exposure: () => 0.8,
    });
    const top = [x + tilt[0] * h, h, z + tilt[1] * h];
    // cap: a flattened dome
    const radial = 9;
    const capCol = jitterColor(C.mushroomCap, rng, 0.06);
    const rimIdx = [];
    const apex = solid.vertex(add3(top, [0, cr * 0.62, 0]), [0, 1, 0], capCol, 0, 0, 0.1, 1);
    const ringsUp = [];
    for (const [rf, yf] of [[0.55, 0.5], [0.92, 0.18], [1.0, -0.05]]) {
      const ring = [];
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const p = add3(top, [Math.cos(a) * cr * rf, cr * yf, Math.sin(a) * cr * rf]);
        const nn = norm3([Math.cos(a) * rf, yf + 0.4, Math.sin(a) * rf]);
        ring.push(solid.vertex(p, nn, mul3(capCol, 0.85 + 0.15 * yf), 0, 0, 0.1, 1));
      }
      ringsUp.push(ring);
    }
    for (let j = 0; j < radial; j++) solid.triFacing(apex, ringsUp[0][j], ringsUp[0][(j + 1) % radial]);
    for (let r = 0; r < ringsUp.length - 1; r++) {
      for (let j = 0; j < radial; j++) {
        const a = ringsUp[r][j], b = ringsUp[r][(j + 1) % radial], c = ringsUp[r + 1][(j + 1) % radial], d = ringsUp[r + 1][j];
        solid.triFacing(a, b, c); solid.triFacing(a, c, d);
      }
    }
    // underside
    const under = solid.vertex(add3(top, [0, -cr * 0.02, 0]), [0, -1, 0], mul3(C.mushroomStem, 0.7), 0, 0, 0, 0.5);
    const rim = ringsUp[2].map(v => solid.vertex([solid.pos[v * 3], solid.pos[v * 3 + 1], solid.pos[v * 3 + 2]], [0, -1, 0], mul3(C.mushroomStem, 0.75), 0, 0, 0, 0.5));
    for (let j = 0; j < radial; j++) solid.triFacing(under, rim[(j + 1) % radial], rim[j]);
    // spots
    const spots = rng.int(3, 6);
    for (let s = 0; s < spots; s++) {
      const a = rng.angle(), rf = rng.range(0.15, 0.75);
      const yf = 0.62 * (1 - rf * rf) + 0.02;
      const nn = norm3([Math.cos(a) * rf, 0.9, Math.sin(a) * rf]);
      const p = add3(top, [Math.cos(a) * cr * rf, cr * yf + 0.004, Math.sin(a) * cr * rf]);
      const t1 = norm3(cross3(nn, [0, 0, 1])), t2 = cross3(nn, t1);
      const sr2 = cr * rng.range(0.1, 0.16);
      const c0 = solid.vertex(madd3(p, nn, 0.002), nn, C.mushroomSpots, 0, 0, 0.1, 1);
      const ring = [];
      for (let j = 0; j < 6; j++) {
        const aa = (j / 6) * Math.PI * 2;
        ring.push(solid.vertex(add3(p, add3(mul3(t1, Math.cos(aa) * sr2), mul3(t2, Math.sin(aa) * sr2))), nn, C.mushroomSpots, 0, 0, 0.1, 1));
      }
      for (let j = 0; j < 6; j++) solid.triFacing(c0, ring[j], ring[(j + 1) % 6]);
    }
  }
  return { solid, thin: null, height: 0.25, radius: 0.3, crown: { c: [0, 0.1, 0], r: 0.3, ry: 0.15 } };
}

// ---------------------------------------------------------------------------------------------
// Rock: a chunky rounded boulder with a moss cap.
function buildRock(rng, { lod, noise, small = false, mossy = 1 }) {
  const solid = new MeshBuilder();
  const s = small ? rng.range(0.35, 0.6) : 1;
  const radii = [rng.range(0.85, 1.4) * s, rng.range(0.7, 1.0) * s, rng.range(0.75, 1.25) * s];
  const salt = rng.range(0, 100);
  const tone = rng.range(-0.06, 0.06);
  addBlob(solid, {
    center: [0, 0, 0], radii, detail: lod === 0 && !small ? 2 : 1, lump: 0.2, lumpFreq: 1.25, noise3: noise.noise3, salt,
    bend: 0.25, flatBottom: 0.75,
    color: (p, n) => {
      const h = clamp(p[1] / radii[1], -1, 1);
      let c = mix3(C.rockDark, C.rockMid, smoothstep(-0.8, 0.1, h));
      c = mix3(c, C.rockLight, smoothstep(0.1, 0.9, h + 0.3 * n[1]) * 0.8);
      const grain = noise.noise3(p[0] * 2.4, p[1] * 2.4, p[2] * 2.4, 7);
      c = mul3(c, 0.88 + 0.22 * grain + tone);
      const m = smoothstep(0.42, 0.62, n[1] * 0.9 + (noise.noise3(p[0] * 1.3, p[1] * 1.3, p[2] * 1.3, 11) - 0.5) * 0.7 + (mossy - 1) * 0.3);
      return mix3(c, mul3(C.mossCap, 0.9 + 0.2 * grain), m * mossy);
    },
    exposure: (p, n) => clamp(0.55 + 0.45 * n[1], 0, 1),
  });
  return { solid, thin: null, height: radii[1], radius: Math.max(radii[0], radii[2]), sink: radii[1] * 0.2, crown: { c: [0, radii[1] * 0.3, 0], r: Math.max(radii[0], radii[2]), ry: radii[1] } };
}

// ---------------------------------------------------------------------------------------------
// Fallen log: a mossy trunk lying along local X, with cut ends and stubs.
function buildLog(rng, { lod, noise }) {
  const solid = new MeshBuilder();
  const L = rng.range(5.0, 6.2);
  const R = rng.range(0.4, 0.52);
  const salt = rng.int(0, 999);
  const pts = [];
  const n = lod === 0 ? 12 : 7;
  const bz = rng.range(-0.4, 0.4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([-L / 2 + L * t, R * 0.82 - 0.06 * Math.sin(Math.PI * t), bz * Math.sin(Math.PI * t)]);
  }
  const ringCol = (p, isCap) => {
    const d = Math.hypot(p[1] - R * 0.8, p[2]) / R;
    const ring = 0.5 + 0.5 * Math.sin(d * 26);
    return mul3(mix3(mul3(C.cutWood, 0.72), mix3(C.cutWood, C.log, 0.25), ring), 0.72);
  };
  addTube(solid, {
    points: pts, radial: lod === 0 ? 14 : 8,
    radius: (t, ang) => R * (1 - 0.2 * t) * (1 + 0.05 * Math.sin(ang * 7 + t * 9)) * (1 + 0.06 * (noise.noise(t * 6, ang, salt) - 0.5)),
    color: (t, ang, p, nn) => {
      const ridge = 0.5 + 0.5 * Math.sin(ang * 7 + t * 9);
      let c = mix3(mul3(C.log, 0.7), C.log, ridge);
      c = mul3(c, 0.9 + 0.2 * noise.noise(p[0] * 2, ang * 2, salt));
      const m = smoothstep(0.1, 0.55, nn[1] + (noise.noise(p[0] * 1.4, ang * 1.5, salt + 3) - 0.5) * 0.8);
      return mix3(c, mix3(C.barkMoss, C.mossCap, noise.noise(p[0] * 3, ang * 3, salt + 6)), m);
    },
    capStart: true, capEnd: true, capRings: lod === 0 ? 3 : 1,
    capRingColor: f => mul3(mix3(C.cutWood, mix3(C.cutWood, C.log, 0.45), (Math.round(f * 3) % 2)), 0.78),
    capColor: (p, isRing) => (isRing ? mul3(C.log, 0.75) : C.cutWood),
    exposure: (p, nn) => clamp(0.5 + 0.5 * nn[1], 0, 1),
  });
  // re-colour the cap discs with growth rings: caps are the last vertices with axial normals
  for (let i = 0; i < solid.count; i++) {
    const nx = solid.nrm[i * 3];
    if (Math.abs(nx) > 0.95) {
      const p = [solid.pos[i * 3], solid.pos[i * 3 + 1], solid.pos[i * 3 + 2]];
      const c = ringCol(p, true);
      solid.col[i * 3] = c[0]; solid.col[i * 3 + 1] = c[1]; solid.col[i * 3 + 2] = c[2];
    }
  }
  // two branch stubs
  for (let k = 0; k < 2; k++) {
    const t = rng.range(0.25, 0.75);
    const base = [-L / 2 + L * t, R * 0.85, bz * Math.sin(Math.PI * t)];
    const az = rng.range(0.4, 1.2) * (k === 0 ? 1 : -1);
    const dir = norm3([rng.range(-0.3, 0.3), Math.cos(az), Math.sin(az)]);
    addTube(solid, {
      points: [base, madd3(base, dir, R * 0.9), madd3(base, dir, R * 1.5)], radial: 6,
      radius: tt => R * 0.26 * (1 - 0.3 * tt), color: () => C.log, capEnd: true, capColor: () => C.cutWood,
      exposure: () => 0.8,
    });
  }
  return { solid, thin: null, height: R * 1.7, radius: L / 2, length: L, crown: { c: [0, R, 0], r: L / 2, ry: R } };
}

// ---------------------------------------------------------------------------------------------
export const SPECIES = {
  broadleaf: { build: buildBroadleaf, tall: true, footprint: 1.6 },
  araucaria: { build: buildAraucaria, tall: true, footprint: 1.0 },
  treeFern: { build: buildTreeFern, tall: true, footprint: 0.7 },
  cycad: { build: buildCycad, footprint: 0.9 },
  fern: { build: buildFern, footprint: 0.55 },
  bush: { build: buildBush, footprint: 1.0 },
  horsetail: { build: buildHorsetail, footprint: 0.4 },
  flowers: { build: buildFlowers, footprint: 0.35 },
  mushrooms: { build: buildMushrooms, footprint: 0.25 },
  rock: { build: buildRock, footprint: 1.2 },
  rockSmall: { build: (rng, o) => buildRock(rng, { ...o, small: true }), footprint: 0.5 },
  log: { build: buildLog, footprint: 3.0 },
};

/**
 * Variant cache: getModel('broadleaf', 2, 0, { reach }) builds once per key. Keys include the
 * options that change the shape, so the same variant index always gives the same model.
 */
export function createSpeciesLibrary(seed) {
  const noise = createNoise(seed ^ 0x5bd1e995);
  const cache = new Map();
  return {
    noise,
    get(name, variant, lod = 0, opts = {}) {
      const key = `${name}:${variant}:${lod}:${JSON.stringify(opts)}`;
      if (!cache.has(key)) {
        const spec = SPECIES[name];
        if (!spec) throw new Error(`Unknown species ${name}`);
        const { fine, ...shapeOpts } = opts;
        const rng = createRng(seed, `species:${name}:${variant}:${JSON.stringify(shapeOpts)}`);
        cache.set(key, spec.build(rng, { lod, noise, variant, ...opts }));
      }
      return cache.get(key);
    },
    stats() {
      const out = {};
      for (const [k, m] of cache) out[k] = (m.solid ? m.solid.triangles : 0) + (m.thin ? m.thin.triangles : 0);
      return out;
    },
  };
}
