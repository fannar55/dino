import * as THREE from 'three';

// A small head gets more of the texture. Tripo lays out one atlas for the whole model, so a sauropod's
// head (1.5 m on a 22 m animal) gets about 1 % of it: at 1024 px her face is a hundred texels across,
// soft in a close-up. This redraws the atlas: the old one narrower (`body` of its width, all of its
// height) on the left, and the head's UV islands, from the full-size source maps, as large as they fit
// into the column that frees up on the right. Only the UVs change, and an island only moves and scales
// (it never turns), so the tangent-space normal map stays right: three takes the tangents from the
// UVs' directions, which a scale along u or v keeps.
//
// geometry: the rig's one skin; head: [start, count], the head part's vertices in it; maps: the source
// colour and normal maps; size: the new atlas's side in pixels; body: the share of the width the old
// atlas keeps; gutter: pixels kept round each island. Returns { map, normalMap, report }.
export function giveHeadTexels({ geometry, head: [start, count], maps: { map, normalMap = null }, size = 1024, body = 0.82, gutter = 4 }) {
  const uv = geometry.attributes.uv;
  const index = geometry.index.array;

  // The head's islands: its triangles joined by the vertices they share.
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let t = 0; t < index.length; t += 3) {
    if (index[t] < start || index[t] >= start + count) continue;
    const a = find(index[t] - start);
    for (const k of [1, 2]) { const b = find(index[t + k] - start); if (a !== b) parent[b] = a; }
  }
  const byRoot = new Map();
  for (let i = 0; i < count; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, { verts: [], u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity });
    const island = byRoot.get(r);
    const u = uv.getX(start + i), v = uv.getY(start + i);
    island.verts.push(start + i);
    island.u0 = Math.min(island.u0, u); island.u1 = Math.max(island.u1, u);
    island.v0 = Math.min(island.v0, v); island.v1 = Math.max(island.v1, v);
  }
  const islands = [...byRoot.values()].sort((a, b) => (b.v1 - b.v0) - (a.v1 - a.v0));

  // Shelf packing at scale k (new pixels per unit of UV) down the column on the right. Returns each
  // island's box corner, or null when they do not all fit.
  const B = Math.round(body * size);
  const bands = [[B, 0, size - B, size]];
  const pack = k => {
    const spots = [];
    let band = 0, x = bands[0][0], y = bands[0][1], shelf = 0;
    for (const island of islands) {
      const w = (island.u1 - island.u0) * k + 2 * gutter, h = (island.v1 - island.v0) * k + 2 * gutter;
      for (;;) {
        if (band >= bands.length) return null;
        const [bx, by, bw, bh] = bands[band];
        if (x + w > bx + bw) { x = bx; y += shelf; shelf = 0; }
        if (w <= bw && y + h <= by + bh) break;
        band++;
        if (band < bands.length) { [x, y] = bands[band]; shelf = 0; }
      }
      spots.push([x, y]);
      x += w;
      shelf = Math.max(shelf, h);
    }
    return spots;
  };
  let lo = 0.5 * size, hi = 20 * size;
  if (!pack(lo)) throw new Error('the head does not fit beside the atlas');
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (pack(mid)) lo = mid; else hi = mid; }
  const k = Math.floor(lo);
  const spots = pack(k);

  // The new maps: the old atlas narrowed into the left, each island's box copied from the source at
  // its new size (flat normals where nothing is drawn).
  const draw = (image, empty) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.fillStyle = empty;
    g.fillRect(0, 0, size, size);
    g.drawImage(image, 0, 0, image.width, image.height, 0, 0, B, size);
    islands.forEach((island, j) => {
      const [x, y] = spots[j];
      const perX = image.width / k, perY = image.height / k; // source pixels per new pixel
      const w = (island.u1 - island.u0) * k + 2 * gutter, h = (island.v1 - island.v0) * k + 2 * gutter;
      g.drawImage(image, island.u0 * image.width - gutter * perX, island.v0 * image.height - gutter * perY, w * perX, h * perY, x, y, w, h);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.userData.mimeType = 'image/jpeg';
    return texture;
  };
  const out = { map: draw(map.image, '#000'), normalMap: normalMap ? draw(normalMap.image, 'rgb(128,128,255)') : null };
  out.map.colorSpace = THREE.SRGBColorSpace;
  for (const key of ['map', 'normalMap']) {
    const source = key === 'map' ? map : normalMap;
    if (!out[key]) continue;
    out[key].wrapS = source.wrapS; out[key].wrapT = source.wrapT;
    out[key].magFilter = source.magFilter; out[key].minFilter = source.minFilter;
  }

  // The UVs: the body's into the left, each head island's into its box.
  const moved = new Uint8Array(uv.count);
  islands.forEach((island, j) => {
    const [x, y] = spots[j];
    for (const i of island.verts) {
      uv.setXY(i, (x + gutter + (uv.getX(i) - island.u0) * k) / size, (y + gutter + (uv.getY(i) - island.v0) * k) / size);
      moved[i] = 1;
    }
  });
  for (let i = 0; i < uv.count; i++) if (!moved[i]) uv.setX(i, (uv.getX(i) * B) / size);
  uv.needsUpdate = true;
  return { ...out, report: { islands: islands.length, body: +(B / size).toFixed(3), head: +(k / size).toFixed(3) } };
}
