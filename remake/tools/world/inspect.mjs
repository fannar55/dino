#!/usr/bin/env node
// Pixel probe for review captures.
//   node remake/tools/world/inspect.mjs shot.png 640,400 rect:100,500,80,40 [grey:out.png]
// Points print the sRGB hex and relative luminance; rects print the average colour, luminance
// mean and spread; grey:<file> writes a greyscale copy (the STYLE.md thumbnail check).
import { readPng, writePng, luminance } from './png.mjs';

const [file, ...probes] = process.argv.slice(2);
if (!file) {
  console.log('usage: inspect.mjs <png> [x,y] [rect:x,y,w,h] [grey:out.png]');
  process.exit(1);
}
const img = readPng(file);
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const px = (x, y) => {
  const i = (Math.min(img.height - 1, Math.max(0, y)) * img.width + Math.min(img.width - 1, Math.max(0, x))) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

for (const p of probes) {
  if (p.startsWith('rect:')) {
    const [x, y, w, h] = p.slice(5).split(',').map(Number);
    let r = 0, g = 0, b = 0, n = 0, lMin = 1, lMax = 0, lSum = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const c = px(xx, yy);
      r += c[0]; g += c[1]; b += c[2]; n++;
      const l = luminance(...c);
      lSum += l; lMin = Math.min(lMin, l); lMax = Math.max(lMax, l);
    }
    console.log(`${p}  avg ${hex(r / n, g / n, b / n)}  lum mean ${(lSum / n).toFixed(3)} min ${lMin.toFixed(3)} max ${lMax.toFixed(3)}`);
  } else if (p.startsWith('grey:')) {
    const out = { width: img.width, height: img.height, data: new Uint8Array(img.data.length) };
    for (let i = 0; i < img.data.length; i += 4) {
      const l = luminance(img.data[i], img.data[i + 1], img.data[i + 2]);
      const v = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    writePng(p.slice(5), out);
    console.log(`wrote ${p.slice(5)}`);
  } else {
    const [x, y] = p.split(',').map(Number);
    const c = px(x, y);
    console.log(`${x},${y}  ${hex(...c)}  lum ${luminance(...c).toFixed(3)}`);
  }
}
