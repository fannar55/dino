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
// `picture` (cards.js; page one's picture unless the card names one, as a teaser does), and that one may be of any kind: the
// owner approved photographs as tile pictures (2026-10-26), so a living animal's tile is a photograph of it and an extinct one's
// a scientist's drawing of how it looked.

export const KINDS = ['fossil', 'photo', 'illustration', 'render', 'placeholder'];
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
    const ownTile = card.picture !== undefined && card.picture !== card.pages[0]?.image; // a picture of the tile's own, not page one's
    if (ownTile && !manifest.get(card.picture)) problems.push(`card "${card.id}": the tile's picture ${card.picture} is not in the manifest`);
    card.pages.forEach((page, i) => {
      const image = manifest.get(page.image);
      if (!image) problems.push(`card "${card.id}" page ${i + 1}: the picture ${page.image} is not in the manifest`);
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

// The book's 3D models (spec section 3.4) are in the same file, under "models":
//
//   { "models": [ { "id", "src", "credit", "license", "licenseUrl", "source", "alt", "modifications", "sha256", "triangles",
//                   "bytes" }, ... ] }
//
// A page's `model` (cards.js) names one by its src, a GLB read from remake/. The card's ⓘ says who made the model while it shows.
// A museum's scan needs what a picture that is not our own needs; the owner's own Tripo models have license 'own'. A model is light
// enough for the tablet: at most MODEL_TRIANGLES triangles and MODEL_BYTES bytes.

export const MODEL_TRIANGLES = 50000;
export const MODEL_BYTES = 2 * 1024 * 1024;
const MODEL_FIELDS = ['id', 'src', 'credit', 'license', 'licenseUrl', 'source', 'alt', 'modifications', 'sha256', 'triangles', 'bytes', 'turn'];

/** The manifest's models by src (none when it has no "models"). Throws an Error naming a model with no id or src, or one there twice. */
export function parseModels(data) {
  const list = data?.models ?? [];
  if (!Array.isArray(list)) throw new Error('media-manifest.json: the models should be a list, under "models"');
  const models = new Map();
  const ids = new Set();
  list.forEach((raw, index) => {
    const name = text(raw?.id) ? `"${raw.id}"` : `number ${index + 1}`;
    const fail = problem => { throw new Error(`media-manifest.json: model ${name} ${problem}`); };
    if (!text(raw?.id)) fail('has no id');
    if (!text(raw.src)) fail('has no src');
    if (ids.has(raw.id) || models.has(raw.src)) fail('is there twice');
    ids.add(raw.id);
    models.set(raw.src, Object.fromEntries(MODEL_FIELDS.map(field => [field, raw[field] ?? null])));
  });
  return models;
}

/**
 * Everything wrong with the models the cards' pages use, one line per problem; none is all right. `bytes(path)` is the size of
 * the file at a path as the manifest gives it, or null when it is not there.
 */
export function checkModels(models, cards, { bytes }) {
  const problems = [];
  for (const card of cards) {
    card.pages.forEach((page, i) => {
      if (page.model && !models.has(page.model)) problems.push(`card "${card.id}" page ${i + 1}: the model ${page.model} is not in the manifest`);
    });
  }
  for (const model of models.values()) {
    if (model.license !== 'own') {
      const missing = Object.keys(EXTERNAL).filter(field => !text(model[field]));
      if (missing.length) problems.push(`${model.id}: a model that is not our own needs ${and(missing.map(field => EXTERNAL[field]))}`);
    }
    if (text(model.license) && !licenceFamily(model.license)) {
      problems.push(`${model.id}: the licence ${model.license} is not an open one (CC BY, CC BY-SA, CC0 or public domain)`);
    }
    if (!/\.glb$/i.test(model.src)) problems.push(`${model.id}: the model ${model.src} is not a GLB`);
    if (model.turn !== null && model.turn !== 'rock') problems.push(`${model.id}: turn is ${model.turn}; a model turns round, or rocks with turn "rock"`);
    if (!(model.triangles > 0) || model.triangles > MODEL_TRIANGLES) {
      problems.push(`${model.id}: it has ${model.triangles ?? 'no count of'} triangles; a model has at most ${MODEL_TRIANGLES}`);
    }
    const size = bytes(model.src);
    if (size === null) problems.push(`${model.id}: the model ${model.src} is not there`);
    else if (size > MODEL_BYTES) problems.push(`${model.id}: the model ${model.src} is ${size} bytes; a model is at most ${MODEL_BYTES}`);
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
