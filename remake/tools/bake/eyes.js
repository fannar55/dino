import * as THREE from 'three';

// Finds a character's painted eyes, for the eyelids the engine builds in code (engine/eyelids.js).
// Tripo paints the eyes into the colour map: a dark pupil in a coloured iris, a white or pale
// sclera and a white highlight or two, in skin that is lighter than the pupil and darker than the
// highlights. That holds for every character so far (Mosi's amber eyes, Egill's blue-grey ones,
// Grameðla's small brown ones), so the finder needs no tuning per species:
//
//   1. Every texel of the head (triangles the Head bone carries alone, or with the jaw) is mapped
//      onto the surface, so colours and positions go together across the UV islands.
//   2. Dark blobs are pupil candidates (nostrils, mouth corners and ear holes are dark too).
//   3. A candidate scores by the pale texels (sclera, highlights) and the saturated ones (iris)
//      around it; the two best that lie apart are the eyes. `hints` (colour-map pixels) override.
//   4. Each eye is the connected patch of texels around its pupil that differ from the skin there.
//      Its frame: the mean surface normal, `down` the character's down laid onto the eye, `right`
//      across it. Its outline is fitted with an ellipse whose upper and lower halves have their own
//      heights (eyes are often almond-shaped), grown over the rim the eye is painted in (at least by
//      the margin), so a shut lid covers all of the painted eye. The lids' colours are the skin's
//      just above and just below the eye.
//
// Everything is in the skinned mesh's own (bind) space, the space the eyelid shells are built in.
// Returns { eyes: [{ centre, right, down, normal, halfWidth, top, bottom, lid, under, lash }], ... },
// the character's left eye first.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const saturation = (r, g, b) => { const max = Math.max(r, g, b), min = Math.min(r, g, b); return max > 0 ? (max - min) / max : 0; };
const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const percentile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : 0; };
// How far (RGB distance) the colour round an eye's outline must stay from the skin's for the outline
// to grow over it: a painted rim, not skin in shade.
const RIM = 30;
// The most an outline grows over a rim.
const GROW_MAX = 1.4;
const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** The pixels of an image (ImageBitmap, image or canvas) as RGBA bytes. */
export function readPixels(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: g.getImageData(0, 0, image.width, image.height).data };
}

// Every texel inside a triangle's UVs: its pixel, and the surface point and normal it paints.
function rasterize(geometry, triangles, pixels, visit) {
  const { position, normal, uv } = geometry.attributes;
  const index = geometry.index.array;
  const W = pixels.width, H = pixels.height;
  const a = V(), b = V(), c = V(), na = V(), nb = V(), nc = V(), p = V(), n = V();
  for (const t of triangles) {
    const i0 = index[3 * t], i1 = index[3 * t + 1], i2 = index[3 * t + 2];
    const ax = uv.getX(i0) * W, ay = uv.getY(i0) * H;
    const bx = uv.getX(i1) * W, by = uv.getY(i1) * H;
    const cx = uv.getX(i2) * W, cy = uv.getY(i2) * H;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-9) continue;
    a.fromBufferAttribute(position, i0); b.fromBufferAttribute(position, i1); c.fromBufferAttribute(position, i2);
    na.fromBufferAttribute(normal, i0); nb.fromBufferAttribute(normal, i1); nc.fromBufferAttribute(normal, i2);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        p.set(0, 0, 0).addScaledVector(a, l1).addScaledVector(b, l2).addScaledVector(c, l3);
        n.set(0, 0, 0).addScaledVector(na, l1).addScaledVector(nb, l2).addScaledVector(nc, l3).normalize();
        visit(x, y, p, n);
      }
    }
  }
}

/**
 * Find the two painted eyes of a skinned character.
 * mesh: the SkinnedMesh in its bind pose; pixels: readPixels(colour map); hints: optional
 * [[x, y], [x, y]] colour-map pixels on or near each pupil; margin: how much the fitted outline
 * grows (share of its size).
 */
export function findEyes({ mesh, pixels, hints = null, margin = 0.14 }) {
  const geometry = mesh.geometry;
  const bones = mesh.skeleton.bones;
  const headIndex = bones.findIndex(b => b.name === 'Head');
  const jawIndex = bones.findIndex(b => b.name === 'Jaw');
  if (headIndex < 0) throw new Error('no Head bone');
  const { skinIndex, skinWeight } = geometry.attributes;
  const headShare = i => {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const bone = skinIndex.getComponent(i, k);
      if (bone === headIndex || bone === jawIndex) w += skinWeight.getComponent(i, k);
    }
    return w;
  };
  const index = geometry.index.array;
  const head = [];
  for (let t = 0; t < index.length / 3; t++) {
    if (headShare(index[3 * t]) > 0.97 && headShare(index[3 * t + 1]) > 0.97 && headShare(index[3 * t + 2]) > 0.97) head.push(t);
  }
  if (!head.length) throw new Error('no triangles on the head');

  // 1. The head's texels on the surface. A texel on the edge of two triangles comes once.
  const W = pixels.width;
  const texel = new Map(); // pixel index -> sample
  rasterize(geometry, head, pixels, (x, y, p, n) => {
    const k = y * W + x;
    if (texel.has(k)) return;
    const o = 4 * k, d = pixels.data;
    const r = d[o], g = d[o + 1], b = d[o + 2];
    texel.set(k, { x, y, p: p.clone(), n: n.clone(), rgb: [r, g, b], lum: luminance(r, g, b) / 255, sat: saturation(r, g, b) });
  });
  const samples = [...texel.values()];
  const headSize = new THREE.Box3().setFromPoints(samples.map(s => s.p)).getSize(V()).length();
  const skinLum = median(samples.map(s => s.lum));

  // 2. Pupil candidates: blobs of dark texels, joined across the texel grid.
  const dark = s => s.lum < 0.38 * skinLum;
  const seen = new Set();
  const blobs = [];
  for (const s of samples) {
    const k0 = s.y * W + s.x;
    if (!dark(s) || seen.has(k0)) continue;
    const blob = [];
    const queue = [k0];
    seen.add(k0);
    while (queue.length) {
      const k = queue.pop();
      const t = texel.get(k);
      blob.push(t);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kk = (t.y + dy) * W + (t.x + dx);
        const u = texel.get(kk);
        if (u && !seen.has(kk) && dark(u)) { seen.add(kk); queue.push(kk); }
      }
    }
    if (blob.length >= 4) blobs.push(blob);
  }
  // Blobs that are one dark shape split over two UV islands meet on the surface: merge them.
  const centreOf = list => list.reduce((sum, t) => sum.add(t.p), V()).divideScalar(list.length);
  const radiusOf = (list, c) => Math.sqrt(list.reduce((sum, t) => sum + t.p.distanceToSquared(c), 0) / list.length) * 1.4 + 1e-4;
  let candidates = blobs.map(list => { const c = centreOf(list); return { texels: list, centre: c, radius: radiusOf(list, c) }; });
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i], b = candidates[j];
        if (a.centre.distanceTo(b.centre) < 1.25 * (a.radius + b.radius)) {
          const list = [...a.texels, ...b.texels];
          const c = centreOf(list);
          candidates[i] = { texels: list, centre: c, radius: radiusOf(list, c) };
          candidates.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  candidates = candidates.filter(c => c.radius < 0.12 * headSize);

  // 3. Score: an eye's near-black pupil sits in a ring that is not skin (an iris, a sclera paler
  // than the skin around it, highlights); a nostril or a mouth corner is dark skin with skin round
  // it. Eyes are in front of the head's pivot (an ear is not) and do not face the ground, and the
  // two sit side by side. The character faces +X in its bind pose.
  const toGeometry = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const up = V(0, 1, 0).transformDirection(toGeometry);
  const forward = V(1, 0, 0).transformDirection(toGeometry);
  mesh.skeleton.bones[headIndex].updateMatrixWorld(true);
  const pivot = mesh.skeleton.bones[headIndex].getWorldPosition(V()).applyMatrix4(toGeometry);
  const hueOf = ([r, g, b]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
    return ((h * 60) + 360) % 360;
  };
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  // Part of an eye, against the skin round it: dark (pupil, lash line, a dark iris), pale (sclera,
  // highlights) or a colour of its own (an iris in another hue). Skin in shade or light is not.
  const eyeTest = skin => {
    const L = luminance(...skin) / 255, H = hueOf(skin);
    return s => s.lum < 0.55 * L || (s.lum > L + 0.12 && s.sat < 0.3) || (s.sat > 0.25 && hueGap(hueOf(s.rgb), H) > 35);
  };
  const skinAround = (centre, inner, outer) => {
    const ring = samples.filter(s => { const d = s.p.distanceTo(centre); return d > inner && d < outer; });
    return [0, 1, 2].map(k => median(ring.map(s => s.rgb[k])));
  };
  for (const c of candidates) {
    const skin = skinAround(c.centre, 3.6 * c.radius, 4.6 * c.radius);
    const L = luminance(...skin) / 255;
    const isEye = eyeTest(skin);
    let pale = 0, ring = 0, ringEye = 0, near = 0;
    const normal = V();
    for (const s of samples) {
      const d = s.p.distanceTo(c.centre);
      if (d > 1.8 * c.radius) continue;
      near++;
      if (s.lum > L + 0.12 && s.sat < 0.3) pale++;
      if (d > c.radius) { ring++; if (isEye(s)) ringEye++; }
      if (d < c.radius) normal.add(s.n);
    }
    c.normal = normal.normalize();
    c.blackness = Math.max(0, 1 - c.texels.reduce((sum, t) => sum + t.lum, 0) / c.texels.length / L);
    c.pale = pale / Math.max(1, near);
    c.ring = ringEye / Math.max(1, ring);
    const placed = c.normal.dot(up) > -0.5 && c.centre.clone().sub(pivot).dot(forward) > 0;
    c.score = placed ? c.blackness * (c.pale + 0.5 * c.ring) * Math.sqrt(c.texels.length) : 0;
  }
  let picked;
  if (hints) {
    picked = hints.map(([x, y]) => {
      const near = candidates.map(c => ({ c, d: Math.min(...c.texels.map(t => Math.hypot(t.x - x, t.y - y))) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 40) throw new Error(`no dark pupil near the hint ${x},${y}`);
      return near.c;
    });
  } else {
    const ranked = candidates.filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
    let best = null;
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        const a = ranked[i], b = ranked[j];
        const apart = a.centre.distanceTo(b.centre);
        if (apart < 4 * Math.max(a.radius, b.radius)) continue;
        if (Math.abs(a.centre.clone().sub(b.centre).dot(up)) > 0.5 * apart) continue;
        if (!best || a.score + b.score > best.score) best = { score: a.score + b.score, pair: [a, b] };
      }
    }
    if (!best) throw new Error(`could not find two eyes among ${JSON.stringify([...candidates].sort((a, b) => b.texels.length - a.texels.length).slice(0, 12).map(c => ({ centre: c.centre.toArray().map(v => +v.toFixed(3)), radius: +c.radius.toFixed(3), texels: c.texels.length, black: +c.blackness.toFixed(2), pale: +c.pale.toFixed(3), ring: +c.ring.toFixed(3), score: +c.score.toFixed(3), normal: c.normal.toArray().map(v => +v.toFixed(2)) })))}`);
    picked = best.pair;
  }

  // 4. Each eye's patch, frame and outline.
  const eyes = picked.map(pupil => {
    const reach = 3.6 * pupil.radius;
    const around = samples.filter(s => s.p.distanceTo(pupil.centre) < reach);
    const skin = skinAround(pupil.centre, 3.6 * pupil.radius, 4.6 * pupil.radius);
    const eyeLike = eyeTest(skin);
    const ring = samples.filter(s => { const d = s.p.distanceTo(pupil.centre); return d > 3.6 * pupil.radius && d < 4.6 * pupil.radius; });
    // Grow from the pupil over eye texels, by distance on the surface, so the patch crosses UV
    // islands. A step is a couple of texels (their spacing from the pupil's area).
    const spacing = (pupil.radius / 1.4) * Math.sqrt(Math.PI / pupil.texels.length);
    const step = 2.2 * spacing;
    const cell = p => `${Math.floor(p.x / step)},${Math.floor(p.y / step)},${Math.floor(p.z / step)}`;
    const grid = new Map();
    for (const s of around) {
      if (!eyeLike(s) && !pupil.texels.includes(s)) continue;
      const k = cell(s.p);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(s);
    }
    const inEye = new Set(pupil.texels);
    const queue = [...pupil.texels];
    while (queue.length) {
      const t = queue.pop();
      const [cx, cy, cz] = cell(t.p).split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const s of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
          if (!inEye.has(s) && s.p.distanceToSquared(t.p) < step * step) { inEye.add(s); queue.push(s); }
        }
      }
    }
    const patch = [...inEye];
    const centre = centreOf(patch);
    const normal = patch.reduce((sum, t) => sum.add(t.n), V()).normalize();
    // The character's down laid onto the eye, and the direction across it.
    const down = up.clone().negate().addScaledVector(normal, up.dot(normal)).normalize();
    const right = down.clone().cross(normal).normalize();
    // The outline: an ellipse across (u) with its own heights above and below (v).
    const uv = patch.map(t => { const d = t.p.clone().sub(centre); return [d.dot(right), d.dot(down)]; });
    const u0 = percentile(uv.map(q => q[0]), 0.02), u1 = percentile(uv.map(q => q[0]), 0.98);
    const halfWidth = (u1 - u0) / 2;
    const cu = (u0 + u1) / 2;
    // Each half height is the smallest that holds 98 % of the patch once the ellipse narrows.
    const heights = side => percentile(uv.filter(q => Math.sign(q[1]) === side).map(([u, v]) => Math.abs(v) / Math.sqrt(Math.max(0.15, 1 - ((u - cu) / halfWidth) ** 2))), 0.98);
    const top = heights(-1), bottom = heights(1);
    const middle = centre.clone().addScaledVector(right, cu);
    // Where a point lies against the outline: 1 on it, less inside.
    const local = s => { const d = s.p.clone().sub(middle); return { u: d.dot(right), v: d.dot(down), w: d.dot(normal) }; };
    const reachOf = ({ u, v }) => Math.hypot(u / halfWidth, v / (v < 0 ? top : bottom));
    // The outline grows to take in the rim the eye is painted in (a paler or darker ring round it),
    // out to where the colour round it is the skin's again; at least by the margin.
    const near = samples.filter(s => { const q = local(s); return Math.abs(q.w) < halfWidth && reachOf(q) < 2.2; });
    // The skin to compare with is the skin just outside that: round the outline at twice its size.
    const outside = near.filter(s => { const r = reachOf(local(s)); return r > 1.9 && r < 2.3; });
    const localSkin = outside.length > 12 ? [0, 1, 2].map(k => median(outside.map(s => s.rgb[k]))) : skin;
    const toLocal = s => Math.hypot(s.rgb[0] - localSkin[0], s.rgb[1] - localSkin[1], s.rgb[2] - localSkin[2]);
    let grow = 1 + margin;
    const rim = [];
    for (let m = 1; m < GROW_MAX - 0.05; m += 0.05) {
      const band = near.filter(s => { const r = reachOf(local(s)); return r >= m && r < m + 0.08; });
      const differ = band.length < 8 ? 0 : median(band.map(toLocal));
      rim.push(Math.round(differ));
      if (differ < RIM) break;
      grow = Math.max(grow, Math.min(GROW_MAX, m + 0.08));
    }
    // The lids take the skin just above the eye (the upper one) and just below it (the lower one);
    // the lash line is that skin, darkened, the way the eyes' painted outlines are.
    const skinBand = side => {
      const band = near.filter(s => {
        const q = local(s);
        const edge = side < 0 ? top * grow : bottom * grow;
        return Math.abs(q.u / halfWidth) < 0.7 && side * q.v > edge && side * q.v < edge + 0.15 * (top + bottom);
      });
      return [0, 1, 2].map(k => median((band.length > 12 ? band : ring).map(s => s.rgb[k])));
    };
    const lid = skinBand(-1), under = skinBand(1);
    return {
      centre: middle.toArray().map(v => +v.toFixed(5)),
      right: right.toArray().map(v => +v.toFixed(5)),
      down: down.toArray().map(v => +v.toFixed(5)),
      normal: normal.toArray().map(v => +v.toFixed(5)),
      halfWidth: +(halfWidth * grow).toFixed(5),
      top: +(top * grow).toFixed(5),
      bottom: +(bottom * grow).toFixed(5),
      lid: hex(lid),
      under: hex(under),
      lash: hex(lid.map(v => v * 0.35)),
      texels: patch.length,
      grow: +grow.toFixed(2),
      rim,
      pupil: { texels: pupil.texels.length, score: +(pupil.score ?? 0).toFixed(3) },
    };
  });
  // The character's left eye first: the one further to the left of its forward axis (+X in the bind
  // pose; the left is -Z), measured in the world.
  const world = e => V(...e.centre).applyMatrix4(mesh.matrixWorld);
  eyes.sort((a, b) => world(a).z - world(b).z);
  return {
    eyes,
    candidates: candidates.map(c => ({ centre: c.centre.toArray().map(v => +v.toFixed(4)), radius: +c.radius.toFixed(4), texels: c.texels.length, black: +c.blackness.toFixed(2), pale: +c.pale.toFixed(3), ring: +c.ring.toFixed(3), score: +(c.score ?? 0).toFixed(3) })).sort((a, b) => b.score - a.score).slice(0, 8),
    headTexels: samples.length,
    skinLuminance: +skinLum.toFixed(3),
  };
}

/**
 * A copy of a GLB with `extras` merged into the node that holds the named mesh object; the binary
 * chunk (geometry and textures) is kept byte for byte.
 */
export function patchGlbNodeExtras(bytes, nodeName, extras) {
  const view = new DataView(bytes);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  const node = json.nodes.find(n => n.name === nodeName && n.mesh !== undefined);
  if (!node) throw new Error(`no mesh node named ${nodeName}`);
  node.extras = { ...(node.extras || {}), ...extras };
  let text = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(text.length / 4) * 4;
  const rest = new Uint8Array(bytes, 20 + jsonLength);
  const out = new Uint8Array(20 + padded + rest.length);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, out.length, true);
  outView.setUint32(12, padded, true);
  outView.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + padded);
  out.set(rest, 20 + padded);
  return out.buffer;
}
