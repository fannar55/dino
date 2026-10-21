// The far forest: rings of misty tree silhouettes beyond the deep forest. Each ring is two staggered
// rows of overlapping crowns (scalloped outlines, no trunks) standing on a continuous understory
// strip whose foot fades into the fog colour, so the far forest dissolves into mist instead of
// showing posts, gaps or a hard base line. Unlit vertex colours; the height fog does the rest.
// Eight sector meshes, so the part behind the camera is culled.
import * as THREE from 'three';
import { FOREST } from './config.js';
import { createRng, clamp } from './random.js';
import { srgb, mix3 } from './geometry.js';

const SEGMENTS = 28;

/** Radial outline of a union of circles, seen from the crown centre: r(angle). */
function unionOutline(circles, segments) {
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (const c of circles) {
      const b = dx * c.x + dy * c.y;
      const disc = b * b - (c.x * c.x + c.y * c.y - c.r * c.r);
      if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
    }
    out.push([dx * best, dy * best]);
  }
  return out;
}

export function createFarForest({ layout, seed, terrain, q, rings = FOREST.far.rings }) {
  const [cx, cz] = layout.clearing.center;
  const SECTORS = 8;
  const quads = Array.from({ length: SECTORS }, () => ({ pos: [], col: [], idx: [] }));
  const quadOf = th => Math.floor((((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / SECTORS)) % SECTORS;
  const toLin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  let triangles = 0;

  rings.forEach((ring, ri) => {
    const rng = createRng(seed, `far-ring-${ri}`);
    const R = ring.radius;
    const dark = srgb(ring.color[0]);
    const light = srgb(ring.color[1]);
    const haze = srgb(ring.haze);
    const body = mix3(dark, light, 0.45);
    const low = q.name === 'low';

    // understory strip: a continuous bushy band, dark at the top, fading into the fog at its foot
    {
      const circ = Math.PI * 2 * (R - 2);
      const columns = Math.round(circ / (low ? 1.6 : 1.0));
      const bumps = [];
      let s = 0;
      while (s < circ) { const w = rng.range(1.6, 3.2); bumps.push({ s: s + w / 2, w, h: rng.range(0.6, 1.4) }); s += w * 0.7; }
      const heightAt = sPos => {
        let h = ring.strip[0];
        for (const b of bumps) {
          let d = Math.abs(sPos - b.s); d = Math.min(d, circ - d);
          if (d < b.w / 2) h = Math.max(h, ring.strip[0] + b.h * Math.sqrt(1 - (2 * d / b.w) ** 2) + (ring.strip[1] - ring.strip[0]) * 0.5);
        }
        return h;
      };
      for (let i = 0; i < columns; i++) {
        const th0 = (i / columns) * Math.PI * 2, th1 = ((i + 1) / columns) * Math.PI * 2;
        const qd = quads[quadOf((th0 + th1) / 2)];
        const base = qd.pos.length / 3;
        for (const th of [th0, th1]) {
          const x = cx + Math.cos(th) * (R - 2), z = cz + Math.sin(th) * (R - 2);
          const g = terrain.heightAt(x, z);
          const h = heightAt((th / (Math.PI * 2)) * circ);
          qd.pos.push(x, g - 2.5, z, x, g + h * 0.45, z, x, g + h, z);
          for (const c of [haze, mix3(body, haze, 0.35), mix3(dark, body, 0.4)]) qd.col.push(...c.map(toLin));
        }
        // two columns of three rows: four triangles
        qd.idx.push(base, base + 3, base + 4, base, base + 4, base + 1, base + 1, base + 4, base + 5, base + 1, base + 5, base + 2);
        triangles += 4;
      }
    }

    // crowns: two staggered rows of overlapping puff clusters
    const rows = low ? 1 : ring.rows;
    for (let row = 0; row < rows; row++) {
      const rr0 = R + row * 3.2;
      const circ = Math.PI * 2 * rr0;
      const spacing = ring.spacing * (low ? 1.3 : 1);
      let s = rng.range(0, spacing) + row * spacing * 0.5;
      while (s < circ) {
        const th = s / rr0;
        const rr = rr0 + rng.range(-1.5, 1.5);
        const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
        const right = [-Math.sin(th), 0, Math.cos(th)];
        const g = terrain.heightAt(x, z);
        const araucaria = rng.chance(ring.araucaria);
        const h = rng.range(ring.height[0], ring.height[1]) * (araucaria ? 1.2 : 1);
        const tint = rng.range(0.9, 1.1);
        const at = (u, v) => [x + right[0] * u, g + v, z + right[2] * u];
        const circles = [];
        const crownBase = ring.strip[1] - 0.8;
        let centreY;
        if (araucaria) {
          const tiers = rng.int(4, 6);
          centreY = (crownBase + h) / 2;
          for (let k = 0; k < tiers; k++) {
            const u = k / (tiers - 1);
            const y = crownBase + (h - crownBase) * u - centreY;
            const r = (1.9 - 1.2 * u) * rng.range(0.85, 1.1);
            circles.push({ x: -r * 0.5, y, r: r * 0.62 }, { x: r * 0.5, y, r: r * 0.62 }, { x: 0, y: y + 0.2, r: r * 0.6 });
          }
        } else {
          const w = rng.range(ring.crown[0], ring.crown[1]);
          const ch = h - crownBase;
          centreY = crownBase + ch * 0.48;
          const n = rng.int(4, 6);
          for (let k = 0; k < n; k++) {
            const u = n === 1 ? 0 : k / (n - 1) - 0.5;
            const r = w * rng.range(0.25, 0.32) * (1 - 0.22 * Math.abs(u));
            circles.push({ x: u * w * 0.72, y: ch * (0.16 - Math.abs(u) * 0.28) + rng.range(-0.35, 0.35), r });
          }
          circles.push({ x: rng.range(-0.3, 0.3), y: ch * 0.3, r: w * 0.27 });
          circles.push({ x: 0, y: -ch * 0.3, r: w * 0.33 }); // a full lower mass that meets the strip
        }
        const outline = unionOutline(circles, SEGMENTS);
        const qd = quads[quadOf(th)];
        const bodyC = body.map(v => clamp(v * tint, 0, 1));
        const centre = qd.pos.length / 3;
        qd.pos.push(...at(0, centreY));
        qd.col.push(...bodyC.map(toLin));
        for (const [u, v] of outline) {
          // lower edge melts toward the strip and the haze, upper edge catches a little sky
          const k = clamp((v + 3) / 6, 0, 1);
          const lowC = mix3(bodyC, haze, 0.25);
          const topC = mix3(mix3(bodyC, light, 0.35), haze, ring.topHaze);
          const c = mix3(lowC, topC, k);
          qd.pos.push(...at(u, centreY + v));
          qd.col.push(...c.map(toLin));
        }
        for (let i = 0; i < SEGMENTS; i++) qd.idx.push(centre, centre + 1 + i, centre + 1 + ((i + 1) % SEGMENTS));
        triangles += SEGMENTS;
        s += spacing * rng.range(0.75, 1.2);
      }
    }
  });

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.name = 'forest-far';
  const meshes = quads.map((qd, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(qd.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(qd.col, 3));
    g.setIndex(qd.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `Far forest ${i}`;
    mesh.renderOrder = 6;
    return mesh;
  });
  const group = new THREE.Group();
  group.name = 'Far forest';
  for (const m of meshes) group.add(m);
  return {
    mesh: group, meshes, triangles,
    dispose() { for (const m of meshes) m.geometry.dispose(); material.dispose(); },
  };
}
