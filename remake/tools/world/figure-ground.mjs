#!/usr/bin/env node
// Figure-ground check for STYLE.md section 5, rule 2: along a character's outline the background
// must differ from the character by at least 25 % in luminance (clearly darker or lighter).
//   node remake/tools/world/figure-ground.mjs <shots dir> <mask dir> [--min 0.25] [--out dir]
// The mask dir comes from capture.mjs with --eval "$(cat remake/tools/world/mask-eval.js)".
// For every outline pixel it compares the mean relative luminance of the character just inside
// (2 to 4 px) with the background just outside (2 to 4 px). Prints the share of the outline that
// passes, per shot, and writes <out>/<shot>-fg.png (green pass, red fail) and a greyscale thumbnail.
import fs from 'node:fs';
import path from 'node:path';
import { readPng, writePng, luminance } from './png.mjs';

const args = process.argv.slice(2);
const [shotsDir, maskDir] = args;
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const min = Number(opt('min', 0.25));
const outDir = opt('out', shotsDir);
fs.mkdirSync(outDir, { recursive: true });
if (!shotsDir || !maskDir) { console.log('usage: figure-ground.mjs <shots dir> <mask dir> [--min 0.25] [--out dir]'); process.exit(1); }

const results = [];
for (const file of fs.readdirSync(maskDir).filter(f => f.endsWith('.png') && f !== 'montage.png')) {
  const shotFile = path.join(shotsDir, file);
  if (!fs.existsSync(shotFile)) continue;
  const img = readPng(shotFile);
  const mask = readPng(path.join(maskDir, file));
  const { width: W, height: H } = img;
  const inside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) inside[i] = mask.data[i * 4] > 127 ? 1 : 0;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = luminance(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
  const vis = { width: W, height: H, data: new Uint8Array(img.data.length) };
  for (let i = 0; i < img.data.length; i += 4) {
    vis.data[i] = img.data[i] * 0.45; vis.data[i + 1] = img.data[i + 1] * 0.45; vis.data[i + 2] = img.data[i + 2] * 0.45; vis.data[i + 3] = 255;
  }
  let total = 0, pass = 0, darker = 0, lighter = 0;
  const ratios = [];
  for (let y = 4; y < H - 4; y++) {
    for (let x = 4; x < W - 4; x++) {
      const i = y * W + x;
      if (!inside[i]) continue;
      if (inside[i - 1] && inside[i + 1] && inside[i - W] && inside[i + W]) continue; // not an edge
      // ignore the frame border and the ground contact (the bottom of the feet sits on the ground)
      let inSum = 0, inN = 0, outSum = 0, outN = 0;
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 < 4 || d2 > 16) continue;
          const j = (y + dy) * W + (x + dx);
          if (inside[j]) { inSum += lum[j]; inN++; } else { outSum += lum[j]; outN++; }
        }
      }
      if (inN < 4 || outN < 4) continue;
      const li = inSum / inN, lo = outSum / outN;
      const ratio = Math.abs(lo - li) / Math.max(li, lo, 1e-4);
      total++;
      ratios.push(ratio);
      const ok = ratio >= min;
      if (ok) { pass++; if (lo < li) darker++; else lighter++; }
      const o = i * 4;
      vis.data[o] = ok ? 40 : 255; vis.data[o + 1] = ok ? 230 : 40; vis.data[o + 2] = 40;
    }
  }
  if (!total) continue;
  ratios.sort((a, b) => a - b);
  const name = file.replace('.png', '');
  // Head zone: the top 38 % of the silhouette (the frill and head in nearly every framing). Its
  // interior is compared with the backdrop in a ring 4 to 24 px outside the silhouette.
  let top = H, bottom = 0;
  for (let i = 0; i < W * H; i++) if (inside[i]) { const y = (i / W) | 0; if (y < top) top = y; if (y > bottom) bottom = y; }
  const zoneEnd = top + Math.round((bottom - top) * 0.38);
  const dilate = (src, r) => {
    // box dilation through prefix sums: a pixel is set when any source pixel lies in its box
    const sat = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += src[y * W + x]; sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row; }
    }
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      const sum = sat[y1 * (W + 1) + x1] - sat[y0 * (W + 1) + x1] - sat[y1 * (W + 1) + x0] + sat[y0 * (W + 1) + x0];
      out[y * W + x] = sum > 0 ? 1 : 0;
    }
    return out;
  };
  const outer = dilate(inside, 24), innerRing = dilate(inside, 4);
  let inSum = 0, inN = 0, bgSum = 0, bgN = 0, zonePass = 0, zoneTotal = 0;
  for (let y = top; y <= zoneEnd; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (inside[i]) { inSum += lum[i]; inN++; } else if (outer[i] && !innerRing[i]) { bgSum += lum[i]; bgN++; }
  }
  // outline pass rate inside the head zone
  for (let y = Math.max(4, top); y <= Math.min(H - 5, zoneEnd); y++) for (let x = 4; x < W - 4; x++) {
    const i = y * W + x;
    if (!inside[i] || (inside[i - 1] && inside[i + 1] && inside[i - W] && inside[i + W])) continue;
    const o = i * 4;
    zoneTotal++;
    if (vis.data[o + 1] === 230) zonePass++;
  }
  const headIn = inN ? inSum / inN : 0, headBg = bgN ? bgSum / bgN : 0;
  const headRatio = Math.abs(headBg - headIn) / Math.max(headIn, headBg, 1e-4);
  writePng(path.join(outDir, `${name}-fg.png`), vis);
  // greyscale thumbnail (the STYLE.md one-second read test)
  const tw = 256, th = Math.round((H / W) * tw);
  const thumb = { width: tw, height: th, data: new Uint8Array(tw * th * 4) };
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const sx = Math.floor((x / tw) * W), sy = Math.floor((y / th) * H);
    const l = lum[sy * W + sx];
    const v = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
    const o = (y * tw + x) * 4;
    thumb.data[o] = thumb.data[o + 1] = thumb.data[o + 2] = v; thumb.data[o + 3] = 255;
  }
  writePng(path.join(outDir, `${name}-grey.png`), thumb);
  const r = { shot: name, outline: total, pass: +(pass / total).toFixed(3), darkerBg: +(darker / total).toFixed(3), lighterBg: +(lighter / total).toFixed(3), medianRatio: +ratios[Math.floor(ratios.length / 2)].toFixed(3),
    headZonePass: zoneTotal ? +(zonePass / zoneTotal).toFixed(3) : null, headInterior: +headIn.toFixed(4), headBackdrop: +headBg.toFixed(4), headRatio: +headRatio.toFixed(3) };
  results.push(r);
  console.log(`${name.padEnd(8)} outline ${String(total).padStart(5)} px  pass ${(r.pass * 100).toFixed(0).padStart(3)} %  (bg darker ${(r.darkerBg * 100).toFixed(0)} %, lighter ${(r.lighterBg * 100).toFixed(0)} %)  median ratio ${r.medianRatio}  head: outline ${r.headZonePass === null ? '-' : (r.headZonePass * 100).toFixed(0)} %, interior Y ${r.headInterior} vs backdrop Y ${r.headBackdrop} (${(r.headRatio * 100).toFixed(0)} %)`);
}
fs.writeFileSync(path.join(outDir, 'figure-ground.json'), JSON.stringify(results, null, 2));
