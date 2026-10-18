// The book's pictures (spec section 5.4), in assets/book/media-manifest.json, as the old game keeps its own
// (dist/assets/encyclopedia/media-manifest.json):
//
//   { "images": [ { "id", "src", "thumb", "kind", "alt", "credit", "license", "licenseUrl", "source", "modifications", "sha256",
//                   "width", "height" }, ... ] }
//
// `kind` is 'fossil', 'photo', 'illustration', 'render' or 'placeholder'. Our own pictures (the game's renders, the owner's
// drawings and the placeholders) have license 'own', and their source names the render command or the owner. Every other
// picture is external: it needs a credit, an open licence and that licence's URL, its source, and its file's sha256.
// `alt` says in a sentence what the picture shows. Paths are read from remake/, as the page reads them. A tile shows its card's
// first picture, so that one is a drawing.

export const KINDS = ['fossil', 'photo', 'illustration', 'render', 'placeholder'];
const TILE_KINDS = ['illustration', 'render', 'placeholder']; // what page one, and so the tile, may show
const MAX_SIDE = 1024; // px, the long side
const FIELDS = ['id', 'src', 'thumb', 'kind', 'alt', 'credit', 'license', 'licenseUrl', 'source', 'modifications', 'sha256', 'width', 'height'];
const EXTERNAL = { credit: 'a credit', license: 'a licence', licenseUrl: 'a licence URL', source: 'a source', sha256: 'a sha256' };
const FORMATS = { '.jpg': 'JPEG', '.jpeg': 'JPEG', '.webp': 'WebP', '.svg': 'SVG' };

const text = value => typeof value === 'string' && value.trim() !== '';
const and = words => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
const formatOf = path => FORMATS[(/\.[a-z0-9]+$/i.exec(path)?.[0] ?? '').toLowerCase()] ?? null;

/**
 * The manifest's pictures by id (the file's object, or its list), each with every field (null where the file has none).
 * Throws an Error naming the picture when one has no id or src, an unknown kind, or an id used twice.
 */
export function parseManifest(data) {
  const list = Array.isArray(data) ? data : data?.images;
  if (!Array.isArray(list)) throw new Error('media-manifest.json: the pictures should be a list, under "images"');
  const media = new Map();
  list.forEach((raw, index) => {
    const name = text(raw?.id) ? `"${raw.id}"` : `number ${index + 1}`;
    const fail = problem => { throw new Error(`media-manifest.json: picture ${name} ${problem}`); };
    if (!text(raw?.id)) fail('has no id');
    if (media.has(raw.id)) fail('is there twice');
    if (!text(raw.src)) fail('has no src');
    if (!KINDS.includes(raw.kind)) fail(`has an unknown kind ${JSON.stringify(raw.kind)}: it is one of ${KINDS.join(', ')}`);
    media.set(raw.id, Object.fromEntries(FIELDS.map(field => [field, raw[field] ?? null])));
  });
  return media;
}

/** The licence without its version ('CC BY-SA 3.0' and 'CC-BY-SA-3.0' are both CC BY-SA), or null for one that is not open. */
export function licenceFamily(license) {
  const words = String(license ?? '').trim().toLowerCase().replace(/[-_\s]+/g, ' ');
  if (words === 'own' || words === 'public domain') return words;
  const cc = /^(cc0|cc by sa|cc by)(?: \d+(?:\.\d+)*)?$/.exec(words);
  return cc ? { cc0: 'CC0', 'cc by sa': 'CC BY-SA', 'cc by': 'CC BY' }[cc[1]] : null;
}

/**
 * Everything wrong with the pictures the cards use, one line per problem; none is all right. `exists(path)` says whether a
 * file is there and `size(path)` measures it ({ width, height }, or null when it cannot), both for paths as the manifest
 * gives them: tests pass real files or made-up ones.
 */
export function checkMedia(manifest, cards, { exists, size }) {
  const problems = [];
  for (const card of cards) {
    card.pages.forEach((page, i) => {
      const image = manifest.get(page.image);
      if (!image) problems.push(`card "${card.id}" page ${i + 1}: the picture ${page.image} is not in the manifest`);
      else if (i === 0 && !TILE_KINDS.includes(image.kind)) {
        problems.push(`card "${card.id}": page 1's picture is its tile, so it is a drawing (an illustration, a render or a placeholder), not ${image.id}, a ${image.kind}`);
      }
    });
  }
  for (const image of manifest.values()) {
    if (image.license !== 'own') {
      const missing = Object.keys(EXTERNAL).filter(field => !text(image[field]));
      if (missing.length) problems.push(`${image.id}: a picture that is not our own needs ${and(missing.map(field => EXTERNAL[field]))}`);
    }
    if (text(image.license) && !licenceFamily(image.license)) {
      problems.push(`${image.id}: the licence ${image.license} is not an open one (CC BY, CC BY-SA, CC0 or public domain)`);
    }
    for (const [what, path] of [['picture', image.src], ['thumbnail', image.thumb]]) {
      if (!text(path)) {
        problems.push(`${image.id}: it has no ${what}`);
        continue;
      }
      const format = formatOf(path);
      if (format !== 'JPEG' && format !== 'WebP' && !(format === 'SVG' && image.kind === 'placeholder')) {
        problems.push(`${image.id}: the ${what} ${path} is not JPEG or WebP${image.kind === 'placeholder' ? ' (or SVG)' : ''}`);
      }
      if (!exists(path)) {
        problems.push(`${image.id}: the ${what} ${path} is not there`);
        continue;
      }
      if (what !== 'picture') continue;
      const measured = size(path);
      if (!(measured?.width > 0 && measured?.height > 0)) problems.push(`${image.id}: the picture ${path} cannot be measured`);
      else if (Math.max(measured.width, measured.height) > MAX_SIDE) {
        problems.push(`${image.id}: the picture ${path} is ${measured.width}x${measured.height} px; its long side is at most ${MAX_SIDE}`);
      }
    }
  }
  return problems;
}

/**
 * A picture's width and height from its file's bytes (a Uint8Array), or null: a JPEG's frame, a WebP's header, or an SVG's
 * width and height attributes, else its viewBox (ruling B1). For checkMedia's `size` in tests and tools; the page never calls it.
 */
export function imageSize(bytes) {
  const b = bytes;
  const ascii = (at, length) => String.fromCharCode(...b.subarray(at, at + length));
  if (b[0] === 0xff && b[1] === 0xd8) { // JPEG: the first start-of-frame segment holds the size
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff || b[i + 1] === 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; } // markers without a length
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    return null;
  }
  const tag = /<svg\b[^>]*>/i.exec(new TextDecoder().decode(b.subarray(0, 4096)))?.[0];
  if (!tag) return null;
  const attribute = name => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const px = value => (/^\s*\d+(\.\d+)?(px)?\s*$/.test(value ?? '') ? parseFloat(value) : NaN);
  const [width, height] = [px(attribute('width')), px(attribute('height'))];
  if (width > 0 && height > 0) return { width, height };
  const box = (attribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  return box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null;
}
